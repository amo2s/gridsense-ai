import polars as pl
import pandas as pd
from statsmodels.tsa.seasonal import STL

class SeasonalBaseline:
    """
    Step 1.3: Seasonal Baseline Construction (Detection Layer 2).
    """
    def __init__(self, period: int = 24):
        # Assumes a 24-hour daily seasonality period for hourly telemetry
        self.period = period
        self.profiles = {}

    def fit(self, df: pl.DataFrame, features: list[str]) -> None:
        """
        Step 1.3.1 & 1.3.2: STL decomposition and baseline profile generation.
        """
        df = df.with_columns([
            pl.col("timestamp").dt.weekday().alias("day_of_week"),
            pl.col("timestamp").dt.hour().alias("hour")
        ])
        
        # Convert to Pandas for statsmodels compatibility
        pdf = df.to_pandas()
        
        for feature in features:
            # Step 1.3.1: Apply STL decomposition
            # Forward fill ensures continuity for STL calculation if isolated nulls exist
            series = pdf[feature].ffill().bfill()
            
            stl = STL(series, period=self.period, robust=True)
            res = stl.fit()
            
            pdf[f"{feature}_residual"] = res.resid
            
            # Step 1.3.2: Generate per-hour / per-day-of-week baseline profiles
            # Profile establishes what is normal for this exact time slot
            profile = pdf.groupby(["day_of_week", "hour"]).agg(
                expected_value=(feature, "mean"),
                residual_std=(f"{feature}_residual", "std")
            ).reset_index()
            
            # Guard against zero variance
            profile["residual_std"] = profile["residual_std"].replace(0, 1e-6).fillna(1e-6)
            
            profile_dict = {}
            for _, row in profile.iterrows():
                profile_dict[(int(row["day_of_week"]), int(row["hour"]))] = {
                    "expected_value": row["expected_value"],
                    "residual_std": row["residual_std"]
                }
                
            self.profiles[feature] = profile_dict

    def score(self, df: pl.DataFrame, features: list[str], threshold: float = 3.0) -> pl.DataFrame:
        """
        Step 1.3.3: Residual-based anomaly scoring.
        Scores new readings against the baseline profile.
        """
        df = df.with_columns([
            pl.col("timestamp").dt.weekday().alias("day_of_week"),
            pl.col("timestamp").dt.hour().alias("hour")
        ])
        
        for feature in features:
            if feature not in self.profiles:
                raise ValueError(f"Model not fitted for feature: {feature}")
                
            profile_dict = self.profiles[feature]
            
            def get_expected(d, h):
                return profile_dict.get((d, h), {"expected_value": 0.0})["expected_value"]
                
            def get_std(d, h):
                return profile_dict.get((d, h), {"residual_std": 1e-6})["residual_std"]

            df = df.with_columns([
                pl.struct(["day_of_week", "hour"]).map_elements(
                    lambda x: get_expected(x["day_of_week"], x["hour"]),
                    return_dtype=pl.Float64
                ).alias(f"{feature}_expected"),
                
                pl.struct(["day_of_week", "hour"]).map_elements(
                    lambda x: get_std(x["day_of_week"], x["hour"]),
                    return_dtype=pl.Float64
                ).alias(f"{feature}_residual_std")
            ])
            
            # Step 1.3.3: Score reading against residual distribution
            residual_z_expr = (pl.col(feature) - pl.col(f"{feature}_expected")) / pl.col(f"{feature}_residual_std")
            
            df = df.with_columns([
                residual_z_expr.alias(f"{feature}_seasonal_z_score"),
                (residual_z_expr.abs() > threshold).alias(f"{feature}_is_seasonal_anomaly")
            ])
            
        return df

    def get_profiles_for_serialization(self) -> dict:
        """
        Formats profiles to be serialized as artifacts/seasonal_baselines.json.
        """
        json_profiles = {}
        for feature, feature_profile in self.profiles.items():
            json_profiles[feature] = {f"{k[0]}_{k[1]}": v for k, v in feature_profile.items()}
        return json_profiles