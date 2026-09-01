"""
Offline Training Pipeline: Engine D (Intervention Prioritization)
Trains a LightGBM LambdaMART ranker using egress contracts from Engines A, B, and C.
Compiles the optimized artifact to ONNX for low-latency inference in FastAPI.
"""

import os
import numpy as np
import pandas as pd
import lightgbm as lgb
from onnxmltools import convert_lightgbm
from skl2onnx.common.data_types import FloatTensorType

# Dynamically resolve artifact paths relative to the script location (engine_d/artifacts)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACT_DIR = os.path.join(BASE_DIR, "artifacts")
ONNX_MODEL_PATH = os.path.join(ARTIFACT_DIR, "hybrid_ranker.onnx")

def load_simulated_fusion_data() -> pd.DataFrame:
    """
    Simulates the joined historical feature matrix from Engines A, B, and C.
    In production, this is queried from PostgreSQL.

    urgency_label is now generated as a structured function of the features
    (not pure random noise), so the trained ranker has real signal to learn
    from. This mirrors the operational intuition: high risk, high duration/
    frequency penalties, active anomalies, and low reliability should drive
    urgency up. Gaussian noise is added so the model still has to generalize
    rather than memorize a deterministic formula.
    """
    np.random.seed(42)
    n_samples = 10000

    # Simulate queries grouped by a 'region_time_block' (Query ID for Ranking)
    query_ids = np.sort(np.random.randint(0, 500, size=n_samples))

    reliability_score = np.random.uniform(0, 100, n_samples)
    duration_penalty = np.random.uniform(0, 1, n_samples)
    frequency_penalty = np.random.uniform(0, 1, n_samples)
    risk_score = np.random.uniform(0, 100, n_samples)
    is_anomaly = np.random.choice([0, 1], p=[0.8, 0.2], size=n_samples)
    anomaly_confidence = np.random.uniform(0, 1, n_samples)

    # Structured ground-truth signal: weighted combination of normalized
    # features, oriented so LOW reliability and HIGH everything-else pushes
    # urgency up. Weights are illustrative operational priors, not tuned -
    # replace with real historical correlations once available from Postgres.
    raw_urgency_signal = (
        0.35 * (1.0 - reliability_score / 100.0)   # low reliability -> more urgent
        + 0.20 * duration_penalty
        + 0.15 * frequency_penalty
        + 0.20 * (risk_score / 100.0)
        + 0.10 * (is_anomaly * anomaly_confidence)
    )

    # Gaussian noise so the model must generalize, not memorize the formula
    noisy_signal = raw_urgency_signal + np.random.normal(0, 0.05, n_samples)

    # Bucket the continuous signal into the same 0-4 urgency scale as before,
    # using quantiles so label distribution stays roughly balanced.
    urgency_label = pd.qcut(noisy_signal, q=5, labels=False, duplicates="drop")

    data = {
        "query_id": query_ids,
        "feeder_id": [f"FDR-{i}" for i in range(n_samples)],

        # Engine A Features (Reliability)
        "reliability_score": reliability_score,
        "duration_penalty": duration_penalty,
        "frequency_penalty": frequency_penalty,

        # Engine B Features (Risk)
        "risk_score": risk_score,

        # Engine C Features (Anomaly)
        "is_anomaly": is_anomaly,
        "anomaly_confidence": anomaly_confidence,

        # Ground Truth Label: structured urgency signal, bucketed 0-4
        "urgency_label": urgency_label
    }

    df = pd.DataFrame(data)
    # Sort by query_id as required by LightGBM Ranker
    return df.sort_values("query_id").reset_index(drop=True)

def train_lambdamart(df: pd.DataFrame) -> lgb.LGBMRanker:
    """
    Trains the LambdaMART ranking model optimizing for NDCG.
    """
    print("Initializing LambdaMART optimization...")
    
    features = [
        "reliability_score", "duration_penalty", "frequency_penalty", 
        "risk_score", "is_anomaly", "anomaly_confidence"
    ]
    
    # Cast explicitly to float32 to prevent ONNX type-mismatch errors
    X = df[features].astype(np.float32)
    y = df["urgency_label"]
    group = df.groupby("query_id").size().values
    
    ranker = lgb.LGBMRanker(
        objective="lambdarank",
        metric="ndcg",
        importance_type="gain",
        learning_rate=0.05,
        n_estimators=200,
        num_leaves=31,
        min_child_samples=20,
        random_state=42
    )
    
    ranker.fit(
        X, y,
        group=group,
        eval_at=[5, 10]
    )
    
    print("Training complete. Top feature importances:")
    for name, imp in zip(features, ranker.feature_importances_):
        print(f" - {name}: {imp:.4f}")
        
    return ranker, len(features)

def export_to_onnx(model: lgb.LGBMRanker, feature_count: int, output_path: str):
    """
    Serializes the LightGBM model to ONNX format for memory-safe, sub-millisecond production inference.
    """
    print(f"Converting model to ONNX format. Expected input dimensions: (None, {feature_count})")
    
    initial_types = [('float_input', FloatTensorType([None, feature_count]))]
    
    onnx_model = convert_lightgbm(
        model, 
        initial_types=initial_types, 
        target_opset=12
    )
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
        
    print(f"Artifact successfully serialized to: {output_path}")

if __name__ == "__main__":
    df_train = load_simulated_fusion_data()
    champion_model, num_features = train_lambdamart(df_train)
    export_to_onnx(champion_model, num_features, ONNX_MODEL_PATH)