import polars as pl
import numpy as np
import shap
from typing import Any, Dict, List, Tuple

class AnomalyDetector:
    """
    Phase 3: Confidence Scoring & Explainability Engine.
    Orchestrates the three detection layers, calculates a unified confidence score, 
    and generates deterministic, human-readable explanations.
    """
    def __init__(self, layer_weights: Dict[str, float] = None):
        # Step 3.1.1: Define per-layer weights based on empirical agreement priority
        self.weights = layer_weights or {
            "layer1_stat": 0.30,
            "layer2_seas": 0.30,
            "layer3_multi": 0.40
        }
        self.shap_explainer = None

    def attach_shap_explainer(self, iforest_model: Any) -> None:
        """
        Step 3.2.1: Integrate SHAP TreeExplainer for the Isolation Forest layer.
        Requires the native scikit-learn model object.
        """
        self.shap_explainer = shap.TreeExplainer(iforest_model)

    def compute_confidence(self, row: dict) -> float:
        """
        Step 3.1.2: Compute final confidence score as a weighted sum of layer flags.
        Ensures score increases monotonically with layer agreement.
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
        """
        Step 3.3.1: MAD deviation attribution.
        Returns list of (feature_name, magnitude, source_layer).
        """
        attributions = []
        for f in features:
            flag_col = f"{f}_is_anomaly"
            if row.get(flag_col, False):
                magnitude = abs(row.get(f"{f}_robust_z_score", 0.0))
                attributions.append((f, magnitude, "Statistical (MAD)"))
        return attributions

    def extract_layer2_attribution(self, row: dict, features: List[str]) -> List[Tuple[str, float, str]]:
        """
        Step 3.3.2: STL residual attribution.
        """
        attributions = []
        for f in features:
            flag_col = f"{f}_is_seasonal_anomaly"
            if row.get(flag_col, False):
                magnitude = abs(row.get(f"{f}_seasonal_z_score", 0.0))
                attributions.append((f, magnitude, "Seasonal (STL)"))
        return attributions

    def extract_layer3_attribution(self, feature_vector: np.ndarray, feature_names: List[str]) -> List[Tuple[str, float, str]]:
        """
        Step 3.2.1: SHAP explainability for the multivariate Isolation Forest layer.
        feature_vector must be a 1D array or shape (1, n_features).
        """
        if not self.shap_explainer:
            return []
            
        # Ensure 2D shape for SHAP
        vec_2d = feature_vector.reshape(1, -1)
        shap_values = self.shap_explainer.shap_values(vec_2d)
        
        attributions = []
        # shap_values[0] accesses the feature impacts for the single prediction
        for i, f_name in enumerate(feature_names):
            magnitude = abs(shap_values[0][i])
            if magnitude > 0.05:  # Ignore negligible SHAP contributions
                attributions.append((f_name, magnitude, "Multivariate (SHAP)"))
                
        return attributions

    def generate_explanation(self, attributions: List[Tuple[str, float, str]]) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Steps 3.4 & 3.5: Merge, rank, and generate human-readable reason strings.
        """
        # Step 3.4.1: Merge and rank all attributions by absolute magnitude (descending)
        ranked = sorted(attributions, key=lambda x: x[1], reverse=True)
        
        # Standardize for the API payload
        ranked_dicts = [{"feature": f, "magnitude": round(m, 3), "source": s} for f, m, s in ranked]
        
        # Step 3.5.1: Template-based natural language reason strings
        reasons = []
        seen_templates = set()
        
        # Extract top 3 distinct reasons to keep UI clean
        for item in ranked:
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