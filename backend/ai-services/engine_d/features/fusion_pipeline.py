"""
Phase 3: Data Fusion & Feature Vectorization (features/fusion_pipeline.py)
Translates validated Pydantic payloads into inference-ready tensors using Polars.
Ensures memory-safe, high-speed transformations for the ONNX Runtime.
"""

import polars as pl
import numpy as np
from typing import Tuple, List
from schemas.ranking_contracts import PrioritizationRequest

def vectorize_payload_to_tensor(request: PrioritizationRequest) -> Tuple[np.ndarray, List[str]]:
    """
    Converts the incoming multi-engine batch request into a strict 32-bit float tensor.
    
    Args:
        request (PrioritizationRequest): The strictly validated ingress payload.
        
    Returns:
        Tuple[np.ndarray, List[str]]: The (None, 6) feature tensor and the ordered list of feeder IDs.
    """
    # 1. Extract asset data natively from the validated Pydantic models
    asset_dicts = [asset.model_dump() for asset in request.assets]
    
    # 2. Ingest into Polars for high-speed manipulation
    df = pl.DataFrame(asset_dicts)
    
    # 3. Dimensional Alignment: Strictly isolate the exact 6 features in the exact training order
    feature_columns = [
        "reliability_score", 
        "duration_penalty", 
        "frequency_penalty", 
        "risk_score", 
        "is_anomaly", 
        "anomaly_confidence"
    ]
    
    feature_df = df.select(feature_columns)
    
    # 4. Tensor Casting: Convert the tabular Polars structure into a continuous 32-bit float array
    # This precisely matches the initial_types=[('float_input', FloatTensorType([None, 6]))] from the ONNX compilation
    input_tensor = feature_df.to_numpy().astype(np.float32)
    
    # 5. Extract the ordered feeder IDs to map predictions back to the correct grid assets downstream
    feeder_ids = df.get_column("feeder_id").to_list()
    
    return input_tensor, feeder_ids