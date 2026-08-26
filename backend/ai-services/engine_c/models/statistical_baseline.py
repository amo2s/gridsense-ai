import numpy as np
import polars as pl
from scipy.stats import median_abs_deviation

class RobustStatisticalBaseline:
    """
    Step 1.2: Robust Statistical Baseline Construction (Detection Layer 1).
    """
    def __init__(self, threshold: float = 3.5):
        # Step 1.2.3: Calibrate per-feature alert thresholds (commonly 3.5)
        self.threshold = threshold
        self.baselines = {}

    def fit(self, df: pl.DataFrame, features: list[str]) -> None:
        """
        Step 1.2.1: Compute per-feature median and MAD over the historical window.
        """
        for feature in features:
            # Extract clean numpy array for scipy statistics
            feature_data = df.get_column(feature).drop_nulls().to_numpy()
            
            med = np.median(feature_data)
            raw_mad = median_abs_deviation(feature_data)
            
            # Guard against zero MAD (constant signals) to prevent division by zero
            if raw_mad == 0.0:
                raw_mad = 1e-6
                
            self.baselines[feature] = {
                "median": med,
                "mad": raw_mad
            }

    def score(self, df: pl.DataFrame, features: list[str]) -> pl.DataFrame:
        """
        Step 1.2.2: Implement the robust z-score scoring function.
        Scores each reading as (value - median) / (1.4826 * MAD).
        """
        expressions = []
        
        for feature in features:
            if feature not in self.baselines:
                raise ValueError(f"Model has not been fitted for feature: {feature}")
            
            med = self.baselines[feature]["median"]
            mad = self.baselines[feature]["mad"]
            
            # Step 1.2.2: Vectorized robust z-score computation
            robust_z_expr = (pl.col(feature) - med) / (1.4826 * mad)
            
            expressions.extend([
                robust_z_expr.alias(f"{feature}_robust_z_score"),
                (robust_z_expr.abs() > self.threshold).alias(f"{feature}_is_anomaly")
            ])
            
        return df.with_columns(expressions)

    def get_metadata(self) -> dict:
        """
        Prepare baseline parameters for serialization into artifacts/model_metadata.json.
        """
        return {
            "threshold": self.threshold,
            "baselines": self.baselines
        }