import time
import json
import logging
from pathlib import Path
from contextlib import asynccontextmanager
import os

import joblib
import numpy as np
import polars as pl
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, status
from dotenv import load_dotenv

# Import Schema Contracts
from schemas.anomaly_contracts import (
    TelemetryWindowRequest,
    AnomalyResponse,
    LayerFlags,
    SeverityLevel,
    AttributionFactor
)

# Import Core ML Logic
from features.pipeline import engineer_multivariate_features, normalize_features
from models.anomaly_detector import AnomalyDetector

# 1. Load Environment Variables
load_dotenv()

# Configure Structured Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("EngineC_InferenceAPI")

ARTIFACTS_DIR = Path("artifacts")

# Global In-Memory State Container
engine_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Asynchronous Startup Phase. 
    Loads all JSON baselines, PyOD ensembles, and ONNX binaries directly into RAM.
    Eliminates disk read latency during production inference requests.
    """
    logger.info("Initializing Engine C Inference Server...")
    
    try:
        # Load Phase 1 & 2 Metadata
        with open(ARTIFACTS_DIR / "model_metadata.json", "r") as f:
            engine_state["metadata"] = json.load(f)
            
        with open(ARTIFACTS_DIR / "seasonal_baselines.json", "r") as f:
            engine_state["seasonal"] = json.load(f)
            
        # Load Phase 2 PyOD Models
        engine_state["pyod"] = joblib.load(ARTIFACTS_DIR / "pyod_ensemble.joblib")
        
        # Initialize Phase 2 ONNX C++ Runtime (CPU Optimized)
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        engine_state["onnx"] = ort.InferenceSession(
            str(ARTIFACTS_DIR / "isolation_forest.onnx"),
            sess_options,
            providers=["CPUExecutionProvider"]
        )
        
        # Initialize Phase 3 Orchestrator
        engine_state["detector"] = AnomalyDetector()
        
        # Warmup the ONNX Runtime (Prevents cold-start spike on the first request)
        dummy_input = np.zeros((1, 5), dtype=np.float32)
        engine_state["onnx"].run(None, {"float_input": dummy_input})
        
        logger.info(f"Engine C Online. Loaded Model Version: {engine_state['metadata']['version']}")
        yield
        
    except Exception as e:
        logger.error(f"Critical Failure during model loading: {e}")
        raise RuntimeError("Failed to initialize Engine C") from e
    finally:
        logger.info("Engine C Shutting Down. Clearing memory caches.")
        engine_state.clear()


# Initialize FastAPI with the lifespan
app = FastAPI(
    title="GridSense AI - Engine C",
    description="High-Performance Core Anomaly Detection Engine",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """
    SLA & Kubernetes Readiness Probe.
    """
    return {
        "status": "healthy",
        "model_version": engine_state["metadata"]["version"],
        "training_records": engine_state["metadata"]["training_records"]
    }

@app.post("/v1/detect", response_model=AnomalyResponse, status_code=status.HTTP_200_OK)
def detect_anomaly(request: TelemetryWindowRequest):
    """
    Main Real-Time Inference Pipeline.
    Evaluates a sliding window of telemetry against all 3 detection layers.
    """
    start_time = time.perf_counter()
    
    try:
        # 1. Ingest to Polars Vectorized Format
        readings_dicts = [r.model_dump() for r in request.readings]
        df = pl.DataFrame(readings_dicts)
        
        # 2. Phase 2 Feature Engineering
        df_multi = engineer_multivariate_features(df, window_size=6)
        multi_features = [
            "voltage_load_ratio", "freq_load_ratio", 
            "voltage_rolling_std", "load_rolling_std", "frequency_rolling_std"
        ]
        df_multi = normalize_features(df_multi, multi_features)
        
        # Extract the chronological latest row for inference evaluation
        latest_row = df_multi.tail(1).to_dicts()[0]
        base_features = ["voltage", "load", "frequency"]
        
        layer1_flag = False
        layer2_flag = False
        
        # 3. Layer 1 Inline Scoring (Robust MAD)
        stat_baselines = engine_state["metadata"]["statistical_layer"]["baselines"]
        stat_threshold = engine_state["metadata"]["statistical_layer"]["threshold"]
        
        for f in base_features:
            med = stat_baselines[f]["median"]
            mad = stat_baselines[f]["mad"]
            # Compute robust z-score inline for speed
            z = (latest_row[f] - med) / (1.4826 * mad)
            latest_row[f"{f}_robust_z_score"] = z
            
            if abs(z) > stat_threshold:
                latest_row[f"{f}_is_anomaly"] = True
                layer1_flag = True
                
        # 4. Layer 2 Inline Scoring (Seasonal STL)
        seas_baselines = engine_state["seasonal"]
        hour_str = str(latest_row["timestamp"].hour)
        seas_threshold = 3.0 # Default fallback threshold
        
        for f in base_features:
            # Safely fetch hour profile; fallback to "0" if missing due to timezone shifts
            profile = seas_baselines.get(f, {}).get(hour_str, seas_baselines.get(f, {}).get("0", {"mean": 0, "std": 1}))
            mean = profile["mean"]
            std = profile["std"] + 1e-6
            
            z = (latest_row[f] - mean) / std
            latest_row[f"{f}_seasonal_z_score"] = z
            
            if abs(z) > seas_threshold:
                latest_row[f"{f}_is_seasonal_anomaly"] = True
                layer2_flag = True

        # 5. Layer 3 Inference (ONNX IForest + PyOD Ensemble)
        scaled_cols = [f"{f}_scaled" for f in multi_features]
        feature_vector = np.array([[latest_row[c] for c in scaled_cols]], dtype=np.float32)
        
        # ONNX IForest Score
        onnx_session = engine_state["onnx"]
        ort_outs = onnx_session.run(None, {"float_input": feature_vector})
        iforest_label = ort_outs[0][0] # Returns -1 for anomaly, 1 for normal
        
        # PyOD Score
        ecod = engine_state["pyod"]["ecod"]
        copod = engine_state["pyod"]["copod"]
        ecod_flag = bool(ecod.predict(feature_vector)[0])
        copod_flag = bool(copod.predict(feature_vector)[0])
        
        layer3_flag = (iforest_label == -1) or ecod_flag or copod_flag

        # 6. Assemble Phase 3 Context
        latest_row["layer1_flag"] = layer1_flag
        latest_row["layer2_flag"] = layer2_flag
        latest_row["layer3_flag"] = layer3_flag
        
        detector: AnomalyDetector = engine_state["detector"]
        conf_score = detector.compute_confidence(latest_row)
        
        # 7. Extract Explainability Attributions
        l1_attr = detector.extract_layer1_attribution(latest_row, base_features)
        l2_attr = detector.extract_layer2_attribution(latest_row, base_features)
        
        # Native Multivariate Extraction (replaces SHAP for speed & deterministic ONNX compatibility)
        l3_attr = []
        if layer3_flag:
            for col, val in zip(scaled_cols, feature_vector[0]):
                if abs(val) > 1.5:  # High absolute deviation in feature relationship
                    l3_attr.append((col.replace("_scaled", ""), float(abs(val)), "Multivariate (Tree/Density)"))
        
        all_attr = l1_attr + l2_attr + l3_attr
        ranked_factors, reasons = detector.generate_explanation(all_attr)
        
        # 8. Deterministic Severity Resolution
        severity = SeverityLevel.LOW
        max_voltage_dev = abs(latest_row.get("voltage_robust_z_score", 0.0))
        
        if conf_score >= 0.8 or max_voltage_dev > 5.0:
            severity = SeverityLevel.CRITICAL
        elif conf_score >= 0.6:
            severity = SeverityLevel.HIGH
        elif conf_score >= 0.35 or layer1_flag or layer2_flag or layer3_flag:
            severity = SeverityLevel.MEDIUM
            
        inference_latency = (time.perf_counter() - start_time) * 1000

        # 9. Return Schema-Compliant Response
        return AnomalyResponse(
            feeder_id=latest_row["feeder_id"],
            timestamp=latest_row["timestamp"],
            is_anomaly=bool(layer1_flag or layer2_flag or layer3_flag),
            severity=severity,
            confidence_score=round(conf_score, 4),
            layer_flags=LayerFlags(
                layer1_stat=layer1_flag,
                layer2_seas=layer2_flag,
                layer3_multi=layer3_flag
            ),
            ranked_attributions=[AttributionFactor(**factor) for factor in ranked_factors],
            reasons=reasons,
            inference_latency_ms=round(inference_latency, 3),
            model_version=engine_state["metadata"]["version"]
        )

    except Exception as e:
        logger.error(f"Inference Engine Crash: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Inference execution failed. Review logs."
        )