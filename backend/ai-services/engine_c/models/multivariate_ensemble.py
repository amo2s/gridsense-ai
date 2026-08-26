import polars as pl
import numpy as np
from sklearn.ensemble import IsolationForest

# PyOD imports for Step 2.3
from pyod.models.ecod import ECOD
from pyod.models.copod import COPOD
from pyod.utils.utility import standardizer

class IsolationForestDetector:
    """
    Step 2.2: Isolation Forest Training (Detection Layer 3).
    Captures cross-feature interaction anomalies that single-feature baselines miss.
    """
    def __init__(self, n_estimators: int = 100, max_samples: str | float | int = "auto", contamination: float = 0.05, random_state: int = 42):
        # The contamination rate will be passed in via Optuna based on the observed FPR benchmark
        self.model = IsolationForest(
            n_estimators=n_estimators,
            max_samples=max_samples,
            contamination=contamination,
            random_state=random_state,
            n_jobs=-1  # Utilize available cores for high-performance training
        )
        self.features = []

    def fit(self, df: pl.DataFrame, features: list[str]) -> None:
        """
        Fits the Isolation Forest on the normalized feature tensor.
        """
        self.features = features
        # Safely extract the exact features required into a NumPy matrix
        X = df.select(self.features).to_numpy()
        self.model.fit(X)

    def score(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Generates continuous anomaly scores and discrete boolean flags.
        """
        if not self.features:
            raise ValueError("The Isolation Forest model must be fitted before scoring.")
            
        X = df.select(self.features).to_numpy()
        
        # sklearn predict() returns -1 for outliers, 1 for normal
        preds = self.model.predict(X)
        is_anomaly = preds == -1
        
        # sklearn decision_function() returns lower scores for anomalies. 
        # We invert it so higher score = higher anomaly risk, standardizing it for Phase 3.
        raw_scores = self.model.decision_function(X)
        anomaly_scores = -raw_scores 

        # Append the results back to the Polars DataFrame efficiently
        return df.with_columns([
            pl.Series("iforest_score", anomaly_scores, dtype=pl.Float64),
            pl.Series("iforest_is_anomaly", is_anomaly, dtype=pl.Boolean)
        ])
        
    def get_params(self) -> dict:
        """
        Retrieves parameters for metadata serialization.
        """
        return self.model.get_params()


class PyODEnsembleDetector:
    """
    Step 2.3: PyOD Ensemble Training (ECOD + COPOD).
    Catches correlation-structure violations that Isolation Forest might miss.
    """
    def __init__(self, contamination: float = 0.05):
        self.contamination = contamination
        # 2.3.1: Initialize parameter-free ECOD
        self.ecod = ECOD(contamination=self.contamination)
        # 2.3.2: Initialize COPOD (explicitly models dependency structures)
        self.copod = COPOD(contamination=self.contamination)
        
        self.features = []
        self.train_scores_ecod = None
        self.train_scores_copod = None

    def fit(self, df: pl.DataFrame, features: list[str]) -> None:
        """
        Fits both PyOD models and stores their decision scores for standardizing later.
        """
        self.features = features
        X = df.select(self.features).to_numpy()
        
        self.ecod.fit(X)
        self.copod.fit(X)
        
        # PyOD standardizer requires 2D arrays (n_samples, 1)
        self.train_scores_ecod = self.ecod.decision_scores_.reshape(-1, 1)
        self.train_scores_copod = self.copod.decision_scores_.reshape(-1, 1)

    def score(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Scores new data, standardizes the outputs, and combines them into a unified ensemble score.
        """
        if not self.features:
            raise ValueError("PyOD Ensemble must be fitted before scoring.")
            
        X = df.select(self.features).to_numpy()
        
        # Get raw anomaly scores
        test_scores_ecod = self.ecod.decision_function(X).reshape(-1, 1)
        test_scores_copod = self.copod.decision_function(X).reshape(-1, 1)
        
        # Step 2.3.3: Normalize and combine ensemble scores using PyOD's standardizer
        _, norm_ecod = standardizer(self.train_scores_ecod, test_scores_ecod)
        _, norm_copod = standardizer(self.train_scores_copod, test_scores_copod)
        
        norm_ecod = norm_ecod.flatten()
        norm_copod = norm_copod.flatten()
        
        # Unified score is the average of the normalized scores
        unified_score = (norm_ecod + norm_copod) / 2.0
        
        # Generate discrete flags (1 is anomaly in PyOD)
        ecod_flag = self.ecod.predict(X).astype(bool)
        copod_flag = self.copod.predict(X).astype(bool)
        unified_flag = ecod_flag | copod_flag  # Flag if either model detects an anomaly

        return df.with_columns([
            pl.Series("pyod_unified_score", unified_score, dtype=pl.Float64),
            pl.Series("pyod_is_anomaly", unified_flag, dtype=pl.Boolean)
        ])

    def get_models_for_export(self) -> dict:
        """
        Prepares PyOD models and scaler states for joblib serialization (Step 2.4).
        """
        return {
            "ecod": self.ecod,
            "copod": self.copod,
            "train_scores_ecod": self.train_scores_ecod,
            "train_scores_copod": self.train_scores_copod
        }