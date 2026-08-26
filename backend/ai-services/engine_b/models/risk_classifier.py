import os
import json
from datetime import datetime, timezone

import numpy as np
import lightgbm as lgb
import shap
import onnxruntime as ort

from schemas.inference_contracts import PredictionRequest, PredictionResponse, ShapFactor
from features.pipeline import FeaturePipeline


class RiskClassifier:
    """
    Central orchestrator for Engine B inference.

    Loads the compiled ONNX artifact for low-latency prediction, and the
    parallel native LightGBM booster for SHAP explainability (SHAP's
    TreeExplainer requires the original tree structure and cannot introspect
    a compiled ONNX graph). Both are produced by the offline training
    pipeline from the same champion model, so their outputs are numerically
    equivalent up to floating point tolerance.
    """

    # Risk tier boundaries on the normalized 0-100 scale
    LOW_UPPER_BOUND = 33.0
    MEDIUM_UPPER_BOUND = 66.0

    # Number of top contributing features to surface in the egress payload
    TOP_N_FACTORS = 5

    def __init__(self, artifacts_dir: str):
        self.artifacts_dir = artifacts_dir

        metadata_path = os.path.join(artifacts_dir, "model_metadata.json")
        onnx_path = os.path.join(artifacts_dir, "risk_model.onnx")
        booster_path = os.path.join(artifacts_dir, "champion_model.txt")

        for path, label in [
            (metadata_path, "model_metadata.json"),
            (onnx_path, "risk_model.onnx"),
            (booster_path, "champion_model.txt"),
        ]:
            if not os.path.exists(path):
                raise FileNotFoundError(
                    f"[FATAL] Required artifact '{label}' not found at {path}. "
                    f"Run the offline training pipeline (scripts/train_engine_b.py) first."
                )

        with open(metadata_path, "r") as f:
            self.metadata = json.load(f)

        self.model_version = self.metadata.get("version", "unknown")
        self.horizon_hours = self.metadata.get("horizon_hours", 6)

        # ONNX Runtime session for fast inference
        self.session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name

        # Native booster + SHAP explainer for explainability
        self.booster = lgb.Booster(model_file=booster_path)
        self.explainer = shap.TreeExplainer(self.booster)

        # Feature pipeline shares the same feature_order as training
        self.pipeline = FeaturePipeline(self.metadata)

    def _score_to_tier(self, risk_score: float) -> str:
        if risk_score < self.LOW_UPPER_BOUND:
            return "LOW"
        elif risk_score < self.MEDIUM_UPPER_BOUND:
            return "MEDIUM"
        return "HIGH"

    def _run_onnx_inference(self, tensor: np.ndarray) -> float:
        """Runs the compiled ONNX graph and returns the positive-class probability."""
        outputs = self.session.run(None, {self.input_name: tensor})

        # LightGBM->ONNX classifiers typically return [labels, probabilities]
        # where probabilities is a list of dicts (ZipMap) or a raw array,
        # depending on onnxmltools version/options. Handle both defensively.
        probs = outputs[1]

        if isinstance(probs, list):
            # ZipMap output: list of dicts like [{0: 0.8, 1: 0.2}]
            first = probs[0]
            positive_prob = float(first.get(1, first.get("1", 0.0)))
        else:
            # Raw ndarray output: shape (n_samples, n_classes)
            arr = np.asarray(probs)
            positive_prob = float(arr[0][1]) if arr.ndim == 2 else float(arr[0])

        return positive_prob

    def _compute_shap_factors(self, tensor: np.ndarray) -> list[ShapFactor]:
        """Computes SHAP contributions for the single-row tensor and returns the top N."""
        shap_values = self.explainer.shap_values(tensor)

        # shap_values may be a list (per-class) for binary classifiers,
        # or a single array depending on SHAP/LightGBM version.
        if isinstance(shap_values, list):
            row_values = shap_values[1][0]  # positive class, single row
        else:
            row_values = shap_values[0]

        feature_order = self.metadata.get("feature_order", [])
        pairs = list(zip(feature_order, row_values))

        # Rank by absolute contribution magnitude, keep signed value
        pairs.sort(key=lambda p: abs(p[1]), reverse=True)
        top_pairs = pairs[: self.TOP_N_FACTORS]

        return [
            ShapFactor(feature_name=name, contribution=float(value))
            for name, value in top_pairs
        ]

    def predict(self, payload: PredictionRequest) -> PredictionResponse:
        """
        Runs the full inference path: vectorize -> ONNX predict -> SHAP explain -> normalize.
        """
        tensor = self.pipeline.vectorize(payload)

        positive_prob = self._run_onnx_inference(tensor)
        risk_score = round(positive_prob * 100.0, 2)
        risk_level = self._score_to_tier(risk_score)

        contributing_factors = self._compute_shap_factors(tensor)

        return PredictionResponse(
            feeder_id=payload.feeder_id,
            generated_at=datetime.now(timezone.utc),
            horizon_hours=self.horizon_hours,
            risk_score=risk_score,
            risk_level=risk_level,
            model_version=self.model_version,
            contributing_factors=contributing_factors,
        )