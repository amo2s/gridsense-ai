import time
import numpy as np
import polars as pl
import shap
import structlog
from typing import Any, Dict, List, Tuple

from schemas.anomaly_contracts import (
    TelemetryWindowRequest,
    AnomalyResponse,
    LayerFlags,
    SeverityLevel,
    AttributionFactor
)
from features.pipeline import engineer_multivariate_features, normalize_features

logger = structlog.get_logger("engine_c.detector")

class AnomalyDetector:
    """
    Phase 3 & 5: Confidence Scoring, Explainability, and Online Inference Engine.
    Orchestrates the three detection layers, calculates a unified confidence score, 
    and generates deterministic, human-readable explanations.
    """
    def __init__(
        self, 
        layer_weights: Dict[str, float] = None,
        metadata: dict = None,
        seasonal_baselines: dict = None,
        pyod_ensemble: dict = None,
        onnx_session: Any = None
    ):
        # Step 3.1.1: Define per-layer weights based on empirical agreement priority
        self.weights = layer_weights or {
            "layer1_stat": 0.30,
            "layer2_seas": 0.30,
            "layer3_multi": 0.40
        }
        self.shap_explainer = None
        
        # Phase 5 Online Inference State
        self.metadata = metadata or {}
        self.seasonal = seasonal_baselines or {}
        self.pyod = pyod_ensemble or {}
        self.onnx = onnx_session
        self.version = self.metadata.get("version", "1.0.0")

    def attach_shap_explainer(self, iforest_model: Any) -> None:
        """
        Step 3.2.1: Integrate SHAP TreeExplainer for the Isolation Forest layer.
        """
        self.shap_explainer = shap.TreeExplainer(iforest_model)

    def compute_confidence(self, row: dict) -> float:
        """
        Step 3.1.2: Compute final confidence score as a weighted sum of layer flags.
        """
        confidence = 0.0
        if row.get("layer1_flag", False):
            confidence += self.weights["layer1_stat"]
        if row.get("layer2_flag", False):
            confidence += self.weights["layer2_seas"]
        if row.get("layer3_flag", False):
            confidence += self.weights["layer3_multi"]
            
        return min(confidence, 1.0)

    def extract_layer1_attribution(self, row: dict, features: List[str]) -> List[Tuple[str, float, str]]:
        """Step 3.3.1: MAD deviation attribution."""
        attributions = []
        for f in features:
            flag_col = f"{f}_is_anomaly"
            if row.get(flag_col, False):
                magnitude = abs(row.get(f"{f}_robust_z_score", 0.0))
                attributions.append((f, magnitude, "Statistical (MAD)"))
        return attributions

    def extract_layer2_attribution(self, row: dict, features: List[str]) -> List[Tuple[str, float, str]]:
        """Step 3.3.2: STL residual attribution."""
        attributions = []
        for f in features:
            flag_col = f"{f}_is_seasonal_anomaly"
            if row.get(flag_col, False):
                magnitude = abs(row.get(f"{f}_seasonal_z_score", 0.0))
                attributions.append((f, magnitude, "Seasonal (STL)"))
        return attributions

    def extract_layer3_attribution(self, feature_vector: np.ndarray, feature_names: List[str]) -> List[Tuple[str, float, str]]:
        """Step 3.2.1: SHAP explainability for the multivariate Isolation Forest layer."""
        if not self.shap_explainer:
            return []
            
        vec_2d = feature_vector.reshape(1, -1)
        shap_values = self.shap_explainer.shap_values(vec_2d)
        
        attributions = []
        for i, f_name in enumerate(feature_names):
            magnitude = abs(shap_values[0][i])
            if magnitude > 0.05:
                attributions.append((f_name, magnitude, "Multivariate (SHAP)"))
                
        return attributions

    def generate_explanation(self, attributions: List[Tuple[str, float, str]]) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Steps 3.4 & 3.5: Merge, rank, and generate human-readable reason strings."""
        ranked = sorted(attributions, key=lambda x: x[1], reverse=True)
        ranked_dicts = [{"feature": f, "magnitude": round(m, 3), "source": s} for f, m, s in ranked]
        
        reasons = []
        seen_templates = set()
        
        for item in ranked_dicts:
            if len(reasons) >= 3:
                break
                
            feature = item["feature"]
            source = item["source"]
            
            if "Statistical" in source and "stat" not in seen_templates:
                reasons.append(f"Abnormal absolute deviation detected in {feature}.")
                seen_templates.add("stat")
            elif "Seasonal" in source and "seas" not in seen_templates:
                reasons.append(f"Unexpected {feature} behavior for this specific time of day.")
                seen_templates.add("seas")
            elif "Multivariate" in source and "multi" not in seen_templates:
                reasons.append(f"Broken cross-feature correlation driven primarily by {feature}.")
                seen_templates.add("multi")
                
        if not reasons:
            reasons.append("Minor anomalous fluctuations detected across multiple signals.")
            
        return ranked_dicts, reasons

    def detect(self, request: TelemetryWindowRequest) -> AnomalyResponse:
        """
        Step 5.2.1 & 5.2.2: Online sequential layer invocation and response assembly.
        """
        start_time = time.perf_counter()
        
        # 1. Feature Engineering
        readings_dicts = [r.model_dump() for r in request.readings]
        df = pl.DataFrame(readings_dicts)
        df_multi = engineer_multivariate_features(df, window_size=6)
        
        multi_features = [
            "voltage_load_ratio", "freq_load_ratio", 
            "voltage_rolling_std", "load_rolling_std", "frequency_rolling_std"
        ]
        df_multi = normalize_features(df_multi, multi_features)
        latest_row = df_multi.tail(1).to_dicts()[0]
        base_features = ["voltage", "load", "frequency"]
        
        # 2. Layer 1: Robust MAD
        l1_flag = False
        stat_baselines = self.metadata["statistical_layer"]["baselines"]
        stat_threshold = self.metadata["statistical_layer"]["threshold"]
        for f in base_features:
            z = (latest_row[f] - stat_baselines[f]["median"]) / (1.4826 * stat_baselines[f]["mad"])
            latest_row[f"{f}_robust_z_score"] = z
            if abs(z) > stat_threshold:
                latest_row[f"{f}_is_anomaly"] = True
                l1_flag = True

        # 3. Layer 2: Seasonal STL
        l2_flag = False
        hour_str = str(latest_row["timestamp"].hour)
        for f in base_features:
            profile = self.seasonal.get(f, {}).get(hour_str, self.seasonal.get(f, {}).get("0", {"mean": 0, "std": 1}))
            z = (latest_row[f] - profile["mean"]) / (profile["std"] + 1e-6)
            latest_row[f"{f}_seasonal_z_score"] = z
            if abs(z) > 3.0:
                latest_row[f"{f}_is_seasonal_anomaly"] = True
                l2_flag = True

        # 4. Layer 3: ONNX Isolation Forest + PyOD
        scaled_cols = [f"{f}_scaled" for f in multi_features]
        feature_vector = np.array([[latest_row[c] for c in scaled_cols]], dtype=np.float32)
        
        ort_outs = self.onnx.run(None, {"float_input": feature_vector})
        iforest_anomaly = bool(ort_outs[0][0] == -1)
        ecod_anomaly = bool(self.pyod["ecod"].predict(feature_vector)[0])
        copod_anomaly = bool(self.pyod["copod"].predict(feature_vector)[0])
        l3_flag = iforest_anomaly or ecod_anomaly or copod_anomaly

        layer_flags = {"layer1_stat": l1_flag, "layer2_seas": l2_flag, "layer3_multi": l3_flag}
        latest_row.update(layer_flags)

        # 5. Scoring & Explanations
        conf_score = self.compute_confidence(layer_flags)
        
        l1_attr = self.extract_layer1_attribution(latest_row, base_features)
        l2_attr = self.extract_layer2_attribution(latest_row, base_features)
        
        # Use SHAP if attached, otherwise fast multivariate extraction
        if self.shap_explainer:
            l3_attr = self.extract_layer3_attribution(feature_vector, scaled_cols)
        else:
            l3_attr = []
            if l3_flag:
                for col, val in zip(scaled_cols, feature_vector[0]):
                    if abs(val) > 1.5:
                        l3_attr.append((col.replace("_scaled", ""), float(abs(val)), "Multivariate (Ensemble)"))
                        
        all_attr = l1_attr + l2_attr + l3_attr
        ranked_factors, reasons = self.generate_explanation(all_attr)

        # 6. Severity Resolution
        is_anomaly = any(layer_flags.values())
        max_voltage_dev = abs(latest_row.get("voltage_robust_z_score", 0.0))
        
        if conf_score >= 0.8 or max_voltage_dev > 5.0:
            severity = SeverityLevel.CRITICAL
        elif conf_score >= 0.6:
            severity = SeverityLevel.HIGH
        elif is_anomaly:
            severity = SeverityLevel.MEDIUM
        else:
            severity = SeverityLevel.LOW

        latency_ms = (time.perf_counter() - start_time) * 1000

        # Step 6.3.1: Structured JSON audit log
        logger.info(
            "anomaly_decision_emitted",
            feeder_id=latest_row["feeder_id"],
            model_version=self.version,
            is_anomaly=is_anomaly,
            confidence_score=round(conf_score, 4),
            severity=severity.value,
            latency_ms=round(latency_ms, 3)
        )

        return AnomalyResponse(
            feeder_id=latest_row["feeder_id"],
            timestamp=latest_row["timestamp"],
            is_anomaly=is_anomaly,
            severity=severity,
            confidence_score=round(conf_score, 4),
            layer_flags=LayerFlags(**layer_flags),
            ranked_attributions=[AttributionFactor(**f) for f in ranked_factors],
            reasons=reasons,
            inference_latency_ms=round(latency_ms, 3),
            model_version=self.version
        )