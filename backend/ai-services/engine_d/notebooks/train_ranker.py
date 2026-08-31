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
    """
    np.random.seed(42)
    n_samples = 10000
    
    # Simulate queries grouped by a 'region_time_block' (Query ID for Ranking)
    query_ids = np.sort(np.random.randint(0, 500, size=n_samples))
    
    data = {
        "query_id": query_ids,
        "feeder_id": [f"FDR-{i}" for i in range(n_samples)],
        
        # Engine A Features (Reliability)
        "reliability_score": np.random.uniform(0, 100, n_samples),
        "duration_penalty": np.random.uniform(0, 1, n_samples),
        "frequency_penalty": np.random.uniform(0, 1, n_samples),
        
        # Engine B Features (Risk)
        "risk_score": np.random.uniform(0, 100, n_samples),
        
        # Engine C Features (Anomaly)
        "is_anomaly": np.random.choice([0, 1], p=[0.8, 0.2], size=n_samples),
        "anomaly_confidence": np.random.uniform(0, 1, n_samples),
        
        # Ground Truth Label: e.g., Actual unserved energy impact or intervention urgency (0-4 scale)
        "urgency_label": np.random.randint(0, 5, n_samples)
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