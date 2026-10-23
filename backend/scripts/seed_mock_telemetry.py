#!/usr/bin/env python3
"""
GridSense AI - Database Mock Telemetry Seeder
============================================
Populates the PostgreSQL database with realistic mock telemetry targeting:
  - Grid Feeders / Topology (feeders)
  - Engine B (risk_predictions)
  - Engine C (anomalies)
  - Engine D (intervention_outcomes)
  - RAG Vector Document Store (grid_document_store)

Uses the local in-memory BAAI/bge-m3 SentenceTransformer embedding pipeline
to generate 1024-dimensional dense vectors for all generated narratives.
"""

import os
import sys
import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Tuple

# Constrain PyTorch thread count before importing torch/sentence_transformers
os.environ["OMP_NUM_THREADS"] = "2"
os.environ["MKL_NUM_THREADS"] = "2"

import torch
torch.set_num_threads(2)

import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("GridSense-Telemetry-Seeder")

# Load environment configuration
for env_path in [
    "backend/services/gateway/.env",
    "backend/ai-services/ai_assistant/.env",
    ".env",
]:
    if os.path.exists(env_path):
        load_dotenv(env_path)
        logger.info(f"Loaded environment variables from: {env_path}")
        break

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    logger.error("DATABASE_URL is not set in any environment file!")
    sys.exit(1)

HF_TOKEN = os.getenv("HF_TOKEN")
if HF_TOKEN:
    os.environ["HF_TOKEN"] = HF_TOKEN


def get_db_connection():
    """Establish connection to PostgreSQL database."""
    logger.info("Connecting to PostgreSQL database...")
    return psycopg2.connect(DATABASE_URL)


def ensure_feeders_exist(conn) -> List[Tuple[str, str]]:
    """
    Ensures at least 3 distinct feeders exist in the database.
    Returns a list of (feeder_id, feeder_name) tuples.
    """
    cur = conn.cursor()

    # 1. Ensure a valid area exists in `areas`
    cur.execute("SELECT id, name FROM areas LIMIT 1;")
    area_row = cur.fetchone()
    if not area_row:
        area_id = str(uuid.uuid4())
        area_name = "Plateau Central Distribution Zone"
        cur.execute(
            """
            INSERT INTO areas (id, name, state, latitude, longitude)
            VALUES (%s, %s, 'Plateau', 9.8965, 8.8583)
            ON CONFLICT (id) DO NOTHING;
            """,
            (area_id, area_name),
        )
        conn.commit()
        logger.info(f"Created baseline area: {area_name} ({area_id})")
    else:
        area_id = area_row[0]

    # 2. Desired mock feeders
    target_feeders = [
        {
            "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
            "name": "North Corridor Feeder",
            "voltage": "33kV",
            "status": "VULNERABLE",
        },
        {
            "id": "e2b8c9d0-1234-4567-89ab-cdef01234567",
            "name": "Feeder Beta (Substation Alpha)",
            "voltage": "11kV",
            "status": "ACTIVE",
        },
        {
            "id": "d3c9b8a7-5678-4321-98ba-fedcba987654",
            "name": "South Industrial Corridor",
            "voltage": "33kV",
            "status": "CRITICAL",
        },
    ]

    feeders = []
    for f in target_feeders:
        cur.execute(
            """
            INSERT INTO feeders (id, area_id, name, voltage_level, status)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                voltage_level = EXCLUDED.voltage_level,
                status = EXCLUDED.status
            RETURNING id, name;
            """,
            (f["id"], area_id, f["name"], f["voltage"], f["status"]),
        )
        fid, fname = cur.fetchone()
        feeders.append((fid, fname))

    conn.commit()
    cur.close()
    logger.info(f"Verified {len(feeders)} feeders in topology.")
    return feeders


class MockTelemetryGenerator:
    """Generates domain-grounded power systems telemetry and embeddings."""

    def __init__(self):
        logger.info("Initializing local SentenceTransformer BAAI/bge-m3 model...")
        self.model = SentenceTransformer("BAAI/bge-m3")
        logger.info("Local BAAI/bge-m3 model loaded successfully (1024 dimensions).")

    def encode_texts(self, texts: List[str]) -> List[List[float]]:
        """Batch encodes a list of texts into 1024-dim normalized vectors."""
        embeddings = self.model.encode(texts, batch_size=8, normalize_embeddings=True, show_progress_bar=True)
        return [emb.tolist() for emb in embeddings]

    def encode_text(self, text: str) -> List[float]:
        """Encodes single text into 1024-dim normalized vector."""
        return self.encode_texts([text])[0]

    def generate_engine_b_records(self, feeders: List[Tuple[str, str]]) -> List[Dict[str, Any]]:
        """Generates realistic Engine B Risk Predictions."""
        now = datetime.now(timezone.utc)
        records = []

        scenarios = [
            {
                "feeder_idx": 0,
                "offset_h": 1,
                "horizon": 24,
                "score": 0.88,
                "level": "CRITICAL",
                "factors": [
                    {"feature_name": "transformer_oil_temperature", "contribution": 0.44},
                    {"feature_name": "peak_load_ratio", "contribution": 0.31},
                    {"feature_name": "historical_fault_count_24h", "contribution": 0.18},
                ],
                "narrative": (
                    "Risk Prediction on North Corridor Feeder: Forecasted at CRITICAL risk level for a 24-hour horizon. "
                    "Prediction Score: 0.88. Key contributing factors (SHAP): transformer oil temperature (44%), peak load ratio (31%), "
                    "and historical fault frequency (18%). Severe thermal escalation detected on the 33kV primary winding."
                ),
            },
            {
                "feeder_idx": 0,
                "offset_h": 4,
                "horizon": 12,
                "score": 0.72,
                "level": "HIGH",
                "factors": [
                    {"feature_name": "ambient_temp_forecast", "contribution": 0.38},
                    {"feature_name": "circuit_breaker_operations", "contribution": 0.28},
                ],
                "narrative": (
                    "Risk Prediction on North Corridor Feeder: Forecasted at HIGH risk level for a 12-hour horizon. "
                    "Prediction Score: 0.72. Key contributing factors (SHAP): ambient temperature forecast spike (38%) and "
                    "repeated circuit breaker trip operations (28%) following heavy distribution feeder loading."
                ),
            },
            {
                "feeder_idx": 1,
                "offset_h": 2,
                "horizon": 24,
                "score": 0.48,
                "level": "MODERATE",
                "factors": [
                    {"feature_name": "power_factor_deviation", "contribution": 0.35},
                    {"feature_name": "evening_peak_load", "contribution": 0.22},
                ],
                "narrative": (
                    "Risk Prediction on Feeder Beta (Substation Alpha): Forecasted at MODERATE risk level for a 24-hour horizon. "
                    "Prediction Score: 0.48. Key contributing factors (SHAP): lagging power factor deviation below 0.84 (35%) and "
                    "forecasted evening residential peak load (22%). Asset operating near rated thermal boundary."
                ),
            },
            {
                "feeder_idx": 1,
                "offset_h": 8,
                "horizon": 48,
                "score": 0.22,
                "level": "STABLE",
                "factors": [
                    {"feature_name": "cooling_system_reserve", "contribution": 0.15},
                ],
                "narrative": (
                    "Risk Prediction on Feeder Beta (Substation Alpha): Forecasted at STABLE risk level for a 48-hour horizon. "
                    "Prediction Score: 0.22. Telemetry indicates healthy transformer winding dissipation and nominal "
                    "feeder load with ample cooling system reserve capacity."
                ),
            },
            {
                "feeder_idx": 2,
                "offset_h": 1,
                "horizon": 24,
                "score": 0.94,
                "level": "CRITICAL",
                "factors": [
                    {"feature_name": "vegetation_encroachment_index", "contribution": 0.52},
                    {"feature_name": "wind_gust_forecast", "contribution": 0.29},
                    {"feature_name": "phase_unbalance_ratio", "contribution": 0.14},
                ],
                "narrative": (
                    "Risk Prediction on South Industrial Corridor: Forecasted at CRITICAL risk level for a 24-hour horizon. "
                    "Prediction Score: 0.94. Key contributing factors (SHAP): severe vegetation encroachment along overhead spans (52%), "
                    "forecasted 45 km/h thunderstorm wind gusts (29%), and phase current unbalance ratio (14%). Imminent phase-to-ground flashover risk."
                ),
            },
            {
                "feeder_idx": 2,
                "offset_h": 6,
                "horizon": 24,
                "score": 0.81,
                "level": "HIGH",
                "factors": [
                    {"feature_name": "industrial_motor_inrush", "contribution": 0.45},
                    {"feature_name": "step_voltage_regulator_duty", "contribution": 0.30},
                ],
                "narrative": (
                    "Risk Prediction on South Industrial Corridor: Forecasted at HIGH risk level for a 24-hour horizon. "
                    "Prediction Score: 0.81. Key contributing factors (SHAP): cyclic heavy industrial motor inrush currents (45%) "
                    "and excessive tap duty cycles on the step voltage regulator (30%)."
                ),
            },
        ]

        narratives = [s["narrative"] for s in scenarios]
        embeddings = self.encode_texts(narratives)

        for s, emb in zip(scenarios, embeddings):
            fid, fname = feeders[s["feeder_idx"]]
            rec_id = str(uuid.uuid4())
            gen_time = now - timedelta(hours=s["offset_h"])
            narrative = s["narrative"]

            records.append({
                "id": rec_id,
                "feeder_id": fid,
                "feeder_name": fname,
                "generated_at": gen_time,
                "horizon": s["horizon"],
                "score": s["score"],
                "level": s["level"],
                "model_version": "bge-xgb-v2.1",
                "contributing_factors": json.dumps(s["factors"]),
                "embedding": emb,
                "narrative": narrative,
            })

        return records

    def generate_engine_c_records(self, feeders: List[Tuple[str, str]]) -> List[Dict[str, Any]]:
        """Generates realistic Engine C Harmonic and Voltage Anomalies."""
        now = datetime.now(timezone.utc)
        records = []

        scenarios = [
            {
                "feeder_idx": 0,
                "offset_h": 2,
                "type": "VOLTAGE_SAG",
                "severity": "CRITICAL",
                "score": 92.4,
                "explanation": (
                    "RMS voltage dropped to 178V on Phase A (nominal 230V) for 480ms during transformer energization. "
                    "Exceeds ITIC/CBEMA power quality operational thresholds."
                ),
                "metadata": {
                    "rms_voltage_v": 178.2,
                    "nominal_voltage_v": 230.0,
                    "sag_depth_pct": 22.5,
                    "duration_ms": 480,
                    "affected_phase": "Phase A",
                },
                "narrative": (
                    "Grid Anomaly on North Corridor Feeder: Detected VOLTAGE_SAG anomaly with severity CRITICAL. "
                    "Risk Score: 92.40. Diagnostic Explanation: RMS voltage dropped to 178V on Phase A for 480ms during transformer "
                    "energization, violating ITIC tolerance curves and triggering industrial customer undervoltage trip relays."
                ),
            },
            {
                "feeder_idx": 0,
                "offset_h": 5,
                "type": "HARMONIC_DISTORTION",
                "severity": "HIGH",
                "score": 84.1,
                "explanation": (
                    "Total Harmonic Distortion (THD-V) surged to 8.2% on the 33kV bus. Pronounced 5th and 7th harmonic orders "
                    "attributed to non-linear arc furnace and inverter switching."
                ),
                "metadata": {
                    "thd_voltage_pct": 8.2,
                    "ieee_519_limit_pct": 5.0,
                    "dominant_harmonic_orders": [5, 7],
                },
                "narrative": (
                    "Grid Anomaly on North Corridor Feeder: Detected HARMONIC_DISTORTION anomaly with severity HIGH. "
                    "Risk Score: 84.10. Diagnostic Explanation: Total Harmonic Distortion surged to 8.2% on the 33kV bus, "
                    "exceeding IEEE 519 standard threshold of 5.0% due to resonance between capacitor banks and non-linear loads."
                ),
            },
            {
                "feeder_idx": 1,
                "offset_h": 3,
                "type": "CURRENT_UNBALANCE",
                "severity": "HIGH",
                "score": 79.5,
                "explanation": (
                    "Phase current unbalance ratio reached 34.2% across feeder conductors. Phase B carried 310A while Phase C carried 185A."
                ),
                "metadata": {
                    "phase_a_amps": 220.0,
                    "phase_b_amps": 310.0,
                    "phase_c_amps": 185.0,
                    "unbalance_pct": 34.2,
                },
                "narrative": (
                    "Grid Anomaly on Feeder Beta (Substation Alpha): Detected CURRENT_UNBALANCE anomaly with severity HIGH. "
                    "Risk Score: 79.50. Diagnostic Explanation: Negative-sequence current unbalance peaked at 34.2% "
                    "due to asymmetric single-phase load distribution across lateral taps."
                ),
            },
            {
                "feeder_idx": 1,
                "offset_h": 10,
                "type": "FREQUENCY_DEVIATION",
                "severity": "MEDIUM",
                "score": 65.0,
                "explanation": (
                    "System grid frequency deviated to 49.38 Hz for 850ms before governor response stabilized the interconnection."
                ),
                "metadata": {
                    "frequency_hz": 49.38,
                    "nominal_hz": 50.0,
                    "deviation_hz": -0.62,
                    "duration_ms": 850,
                },
                "narrative": (
                    "Grid Anomaly on Feeder Beta (Substation Alpha): Detected FREQUENCY_DEVIATION anomaly with severity MEDIUM. "
                    "Risk Score: 65.00. Diagnostic Explanation: Interconnection frequency dropped to 49.38 Hz following an upstream "
                    "generation trip, recovering within governor droop regulation parameters."
                ),
            },
            {
                "feeder_idx": 2,
                "offset_h": 1,
                "type": "ENGINE_C_MULTIVARIATE",
                "severity": "CRITICAL",
                "score": 96.0,
                "explanation": (
                    "Multivariate anomaly detected by Engine C ensemble. Extreme joint anomaly across reactive power absorption, "
                    "neutral ground current leakage (14.2A), and high-frequency transient spikes."
                ),
                "metadata": {
                    "neutral_current_amps": 14.2,
                    "reactive_power_mvar": -3.8,
                    "transient_spike_peak_kv": 48.5,
                    "layer_flags": {"stl_drift": True, "mad_outlier": True, "ml_flag": True},
                },
                "narrative": (
                    "Grid Anomaly on South Industrial Corridor: Detected ENGINE_C_MULTIVARIATE anomaly with severity CRITICAL. "
                    "Risk Score: 96.00. Diagnostic Explanation: Triple-layer consensus triggered by Engine C for neutral ground "
                    "leakage of 14.2A and transient overvoltages of 48.5kV, indicating imminent insulator puncture."
                ),
            },
            {
                "feeder_idx": 2,
                "offset_h": 7,
                "type": "REACTIVE_POWER_OSCILLATION",
                "severity": "HIGH",
                "score": 82.0,
                "explanation": (
                    "Sub-synchronous power oscillation detected between 0.8 Hz and 1.2 Hz in reactive power flow."
                ),
                "metadata": {
                    "oscillation_freq_hz": 1.05,
                    "mvar_swing_peak": 2.4,
                },
                "narrative": (
                    "Grid Anomaly on South Industrial Corridor: Detected REACTIVE_POWER_OSCILLATION anomaly with severity HIGH. "
                    "Risk Score: 82.00. Diagnostic Explanation: Sustained sub-synchronous 1.05 Hz reactive power oscillations "
                    "observed between industrial motor drives and substation compensation capacitors."
                ),
            },
        ]

        narratives = [s["narrative"] for s in scenarios]
        embeddings = self.encode_texts(narratives)

        for s, emb in zip(scenarios, embeddings):
            fid, fname = feeders[s["feeder_idx"]]
            rec_id = str(uuid.uuid4())
            det_time = now - timedelta(hours=s["offset_h"])
            narrative = s["narrative"]

            records.append({
                "id": rec_id,
                "feeder_id": fid,
                "feeder_name": fname,
                "detected_at": det_time,
                "type": s["type"],
                "severity": s["severity"],
                "score": s["score"],
                "explanation": s["explanation"],
                "metadata": json.dumps(s["metadata"]),
                "embedding": emb,
                "narrative": narrative,
            })

        return records

    def generate_engine_d_records(self, feeders: List[Tuple[str, str]]) -> List[Dict[str, Any]]:
        """Generates realistic Engine D Maintenance Interventions and Outcomes."""
        now = datetime.now(timezone.utc)
        records = []

        scenarios = [
            {
                "feeder_idx": 0,
                "offset_h": 3,
                "query_id": str(uuid.uuid4()),
                "score": 0.95,
                "tier": "critical",
                "action": "dispatched",
                "outage_occurred": False,
                "reward": 2.85,
                "features": [
                    {"feature_name": "thermal_escalation_velocity", "contribution": 0.52},
                    {"feature_name": "critical_hospital_load_served", "contribution": 0.33},
                ],
                "narrative": (
                    "Intervention Outcome on North Corridor Feeder: Operator action 'DISPATCH_EMERGENCY_CREW' was dispatched "
                    "under CRITICAL priority tier (priority score: 0.95). Field crew executed transformer cooling flushing and "
                    "tightened high-resistance lug connections. Over a 24-hour window, an outage was PREVENTED. "
                    "Reinforcement learning reward: +2.85."
                ),
            },
            {
                "feeder_idx": 0,
                "offset_h": 14,
                "query_id": str(uuid.uuid4()),
                "score": 0.78,
                "tier": "urgent",
                "action": "dispatched",
                "outage_occurred": False,
                "reward": 1.95,
                "features": [
                    {"feature_name": "feeder_overload_pct", "contribution": 0.46},
                    {"feature_name": "backup_tie_margin", "contribution": 0.35},
                ],
                "narrative": (
                    "Intervention Outcome on North Corridor Feeder: Operator action 'LOAD_TRANSFER_TIE_SWITCH' was dispatched "
                    "under URGENT priority tier (priority score: 0.78). SCADA transferred 4.5 MW load to adjacent circuit. "
                    "Over a 24-hour window, an outage was PREVENTED with optimal feeder headroom. Reinforcement reward: +1.95."
                ),
            },
            {
                "feeder_idx": 1,
                "offset_h": 6,
                "query_id": str(uuid.uuid4()),
                "score": 0.84,
                "tier": "urgent",
                "action": "dispatched",
                "outage_occurred": False,
                "reward": 1.65,
                "features": [
                    {"feature_name": "downstream_voltage_sag_depth", "contribution": 0.48},
                    {"feature_name": "reactive_support_capability", "contribution": 0.30},
                ],
                "narrative": (
                    "Intervention Outcome on Feeder Beta (Substation Alpha): Operator action 'ADJUST_TAP_CHANGER_OLTC' was dispatched "
                    "under URGENT priority tier (priority score: 0.84). OLTC tap raised 2 steps (+2.5% voltage boost) to arrest "
                    "downstream residential voltage sag. Over a 24-hour window, an outage was PREVENTED. Reinforcement reward: +1.65."
                ),
            },
            {
                "feeder_idx": 1,
                "offset_h": 22,
                "query_id": str(uuid.uuid4()),
                "score": 0.62,
                "tier": "high",
                "action": "dispatched",
                "outage_occurred": False,
                "reward": 1.20,
                "features": [
                    {"feature_name": "lagging_power_factor", "contribution": 0.41},
                ],
                "narrative": (
                    "Intervention Outcome on Feeder Beta (Substation Alpha): Operator action 'SWITCH_SHUNT_CAPACITOR_BANK' was dispatched "
                    "under HIGH priority tier (priority score: 0.62). Energized 1.5 MVAR capacitor bank, correcting power factor "
                    "from 0.82 to 0.96. Over a 24-hour window, an outage was PREVENTED. Reinforcement reward: +1.20."
                ),
            },
            {
                "feeder_idx": 2,
                "offset_h": 2,
                "query_id": str(uuid.uuid4()),
                "score": 0.98,
                "tier": "critical",
                "action": "dispatched",
                "outage_occurred": False,
                "reward": 3.10,
                "features": [
                    {"feature_name": "tree_span_proximity_hazard", "contribution": 0.58},
                    {"feature_name": "upcoming_storm_severity", "contribution": 0.31},
                ],
                "narrative": (
                    "Intervention Outcome on South Industrial Corridor: Operator action 'VEGETATION_CLEARING_DISPATCH' was dispatched "
                    "under CRITICAL priority tier (priority score: 0.98). Emergency bucket truck crew trimmed hazardous eucalyptus limbs "
                    "overhanging 33kV Phase C prior to storm front arrival. Over a 24-hour window, an outage was PREVENTED. "
                    "Reinforcement learning reward: +3.10."
                ),
            },
            {
                "feeder_idx": 2,
                "offset_h": 16,
                "query_id": str(uuid.uuid4()),
                "score": 0.86,
                "tier": "critical",
                "action": "dispatched",
                "outage_occurred": False,
                "reward": 2.30,
                "features": [
                    {"feature_name": "surge_arrester_leakage_current", "contribution": 0.54},
                ],
                "narrative": (
                    "Intervention Outcome on South Industrial Corridor: Operator action 'ISOLATE_FAILED_ARRESTER_SECTION' was dispatched "
                    "under CRITICAL priority tier (priority score: 0.86). Sectionalizer opened to isolate degraded lightning surge arrester "
                    "drawing continuous 14A leakage current. Over a 24-hour window, an outage was PREVENTED. Reinforcement reward: +2.30."
                ),
            },
        ]

        narratives = [s["narrative"] for s in scenarios]
        embeddings = self.encode_texts(narratives)

        for s, emb in zip(scenarios, embeddings):
            fid, fname = feeders[s["feeder_idx"]]
            rec_id = str(uuid.uuid4())
            act_time = now - timedelta(hours=s["offset_h"])
            narrative = s["narrative"]

            records.append({
                "id": rec_id,
                "query_id": s["query_id"],
                "feeder_id": fid,
                "feeder_name": fname,
                "predicted_priority_score": s["score"],
                "predicted_priority_tier": s["tier"],
                "shap_top_features": json.dumps(s["features"]),
                "action_taken": s["action"],
                "action_taken_at": act_time,
                "outcome_window_hours": 24,
                "outage_occurred": s["outage_occurred"],
                "outage_checked_at": act_time + timedelta(hours=24),
                "reward_value": s["reward"],
                "reward_computed_at": act_time + timedelta(hours=24),
                "created_at": act_time,
                "embedding": emb,
                "narrative": narrative,
            })

        return records


def seed_database():
    """Main database seeding orchestrator."""
    logger.info("=================================================================")
    logger.info("GRIDSENSE AI: TELEMETRY & RAG DOCUMENT STORE SEEDER")
    logger.info("=================================================================\n")

    conn = get_db_connection()
    generator = MockTelemetryGenerator()

    try:
        # Step 1: Ensure feeders exist
        feeders = ensure_feeders_exist(conn)

        # Step 2: Generate telemetry data and embeddings
        logger.info("\n--- Generating Engine B Risk Predictions ---")
        engine_b_records = generator.generate_engine_b_records(feeders)
        logger.info(f"Generated {len(engine_b_records)} Engine B records.")

        logger.info("\n--- Generating Engine C Anomalies ---")
        engine_c_records = generator.generate_engine_c_records(feeders)
        logger.info(f"Generated {len(engine_c_records)} Engine C records.")

        logger.info("\n--- Generating Engine D Interventions ---")
        engine_d_records = generator.generate_engine_d_records(feeders)
        logger.info(f"Generated {len(engine_d_records)} Engine D records.")

        cur = conn.cursor()

        # Step 3: Insert Engine B (risk_predictions)
        logger.info("\nPersisting Engine B records into 'risk_predictions'...")
        b_query = """
            INSERT INTO risk_predictions 
            (id, feeder_id, generated_at, horizon, score, level, model_version, contributing_factors, embedding, search_text)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector, to_tsvector('english', %s))
            ON CONFLICT (id) DO NOTHING;
        """
        for r in engine_b_records:
            cur.execute(b_query, (
                r["id"], r["feeder_id"], r["generated_at"], r["horizon"],
                r["score"], r["level"], r["model_version"], r["contributing_factors"],
                str(r["embedding"]), r["narrative"]
            ))

        # Step 4: Insert Engine C (anomalies)
        logger.info("Persisting Engine C records into 'anomalies'...")
        c_query = """
            INSERT INTO anomalies 
            (id, feeder_id, detected_at, type, severity, score, explanation, metadata, embedding, search_text)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector, to_tsvector('english', %s))
            ON CONFLICT (id) DO NOTHING;
        """
        for r in engine_c_records:
            cur.execute(c_query, (
                r["id"], r["feeder_id"], r["detected_at"], r["type"],
                r["severity"], r["score"], r["explanation"], r["metadata"],
                str(r["embedding"]), r["narrative"]
            ))

        # Step 5: Insert Engine D (intervention_outcomes)
        logger.info("Persisting Engine D records into 'intervention_outcomes'...")
        d_query = """
            INSERT INTO intervention_outcomes 
            (id, query_id, feeder_id, predicted_priority_score, predicted_priority_tier,
             shap_top_features, action_taken, action_taken_at, outcome_window_hours,
             outage_occurred, outage_checked_at, reward_value, reward_computed_at, created_at,
             embedding, search_text)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector, to_tsvector('english', %s))
            ON CONFLICT (id) DO NOTHING;
        """
        for r in engine_d_records:
            cur.execute(d_query, (
                r["id"], r["query_id"], r["feeder_id"], r["predicted_priority_score"],
                r["predicted_priority_tier"], r["shap_top_features"], r["action_taken"],
                r["action_taken_at"], r["outcome_window_hours"], r["outage_occurred"],
                r["outage_checked_at"], r["reward_value"], r["reward_computed_at"],
                r["created_at"], str(r["embedding"]), r["narrative"]
            ))

        # Step 6: Insert into RAG document store (grid_document_store)
        # Note: fts_vector is GENERATED ALWAYS in PostgreSQL, so we omit it from the column list
        logger.info("\nPersisting all records into RAG document store 'grid_document_store'...")
        rag_query = """
            INSERT INTO grid_document_store
            (feeder_id, source_table, record_id, metric_snippet, metadata, embedding)
            VALUES (%s, %s, %s, %s, %s, %s::vector)
            ON CONFLICT DO NOTHING;
        """

        rag_count = 0
        # Engine B docs
        for r in engine_b_records:
            meta = {
                "feeder_name": r["feeder_name"],
                "score": float(r["score"]),
                "level": r["level"],
                "horizon": r["horizon"],
            }
            cur.execute(rag_query, (
                r["feeder_id"], "risk_predictions", r["id"], r["narrative"],
                json.dumps(meta), str(r["embedding"])
            ))
            rag_count += 1

        # Engine C docs
        for r in engine_c_records:
            meta = {
                "feeder_name": r["feeder_name"],
                "score": float(r["score"]),
                "severity": r["severity"],
                "type": r["type"],
            }
            cur.execute(rag_query, (
                r["feeder_id"], "anomalies", r["id"], r["narrative"],
                json.dumps(meta), str(r["embedding"])
            ))
            rag_count += 1

        # Engine D docs
        for r in engine_d_records:
            meta = {
                "feeder_name": r["feeder_name"],
                "priority_score": float(r["predicted_priority_score"]),
                "tier": r["predicted_priority_tier"],
                "action": r["action_taken"],
                "reward": float(r["reward_value"]) if r["reward_value"] is not None else 0.0,
            }
            cur.execute(rag_query, (
                r["feeder_id"], "intervention_outcomes", r["id"], r["narrative"],
                json.dumps(meta), str(r["embedding"])
            ))
            rag_count += 1

        conn.commit()
        logger.info(f"Successfully committed {rag_count} documents to grid_document_store!")

        # Step 7: Audit Verification and RRF Search Test
        logger.info("\n=================================================================")
        logger.info("SEEDING AUDIT & LIVE HYBRID RETRIEVAL VERIFICATION")
        logger.info("=================================================================")

        for table in ["feeders", "risk_predictions", "anomalies", "intervention_outcomes", "grid_document_store"]:
            cur.execute(f"SELECT COUNT(*) FROM {table};")
            count = cur.fetchone()[0]
            logger.info(f"  Table '{table}' total records: {count}")

        # Execute a test RRF hybrid query against grid_document_store
        test_query = "outage risk and voltage sag anomalies"
        test_emb = generator.encode_text(test_query)
        test_feeder_id = feeders[0][0]

        logger.info(f"\nTesting hybrid search for query: '{test_query}' on feeder: {feeders[0][1]}")
        search_sql = """
            WITH semantic_search AS (
                SELECT 
                    record_id,
                    source_table,
                    metric_snippet,
                    ROW_NUMBER() OVER (ORDER BY embedding <=> %s::vector) AS rank
                FROM grid_document_store
                WHERE feeder_id = %s
                ORDER BY embedding <=> %s::vector
                LIMIT 5
            ),
            lexical_search AS (
                SELECT 
                    record_id,
                    source_table,
                    metric_snippet,
                    ROW_NUMBER() OVER (ORDER BY ts_rank(fts_vector, websearch_to_tsquery('english', %s)) DESC) AS rank
                FROM grid_document_store
                WHERE feeder_id = %s 
                  AND fts_vector @@ websearch_to_tsquery('english', %s)
                ORDER BY rank
                LIMIT 5
            )
            SELECT 
                COALESCE(s.record_id, l.record_id) AS record_id,
                COALESCE(s.source_table, l.source_table) AS source_table,
                COALESCE(s.metric_snippet, l.metric_snippet) AS metric_snippet,
                (COALESCE(1.0 / (60 + s.rank), 0.0) + COALESCE(1.0 / (60 + l.rank), 0.0)) AS rrf_score
            FROM semantic_search s
            FULL OUTER JOIN lexical_search l ON s.record_id = l.record_id
            ORDER BY rrf_score DESC
            LIMIT 3;
        """
        cur.execute(search_sql, (
            str(test_emb), test_feeder_id, str(test_emb),
            test_query, test_feeder_id, test_query
        ))
        test_results = cur.fetchall()
        logger.info(f"Hybrid search returned {len(test_results)} citations:")
        for res in test_results:
            logger.info(f"  - [{res[1]} | RRF: {res[3]:.4f}]: {res[2][:90]}...")

        cur.close()
        conn.close()
        logger.info("\nDatabase seeding and RAG verification completed successfully with 0 errors!")

    except Exception as exc:
        logger.error(f"Seeding failed with error: {exc}", exc_info=True)
        conn.rollback()
        conn.close()
        sys.exit(1)


if __name__ == "__main__":
    seed_database()
