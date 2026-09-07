import asyncio
import json
import logging
import os
from datetime import datetime
import asyncpg
from pgvector.asyncpg import register_vector
from dotenv import load_dotenv
from huggingface_hub import AsyncInferenceClient

# 1. Load environment variables into memory
load_dotenv()

# Configure production logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("GridSense-Embedding-Pipeline")

# 2. Strict environment read (Raises KeyError if missing)
DB_DSN = os.environ["DATABASE_URL"]
HF_TOKEN = os.environ["HF_TOKEN"]

class EmbeddingPipeline:
    def __init__(self):
        logger.info("Initializing Hugging Face Inference client...")
        # Using the official SDK handles task routing and payload formatting automatically
        self.hf_client = AsyncInferenceClient(token=HF_TOKEN)

    async def connect_db(self):
        """Establish async database connection and register pgvector."""
        conn = await asyncpg.connect(DB_DSN)
        # Explicitly target the extensions schema to match Supabase architecture
        await register_vector(conn, schema='extensions')
        return conn

    def serialize_row(self, table: str, row: dict) -> str:
        """Transforms raw database columns into a highly semantic paragraph."""
        feeder = row.get('feeder_name', 'Unknown Feeder')

        if table == "anomalies":
            return (f"Grid Anomaly on {feeder}: Detected {row.get('type')} with severity {row.get('severity')}. "
                    f"Risk Score: {row.get('score')}. Diagnostic Explanation: {row.get('explanation')}.")

        elif table == "outage_events":
            return (f"Power Outage on {feeder}: Incident caused by {row.get('cause')}. "
                    f"Outage lasted for {row.get('duration_minutes')} minutes and affected {row.get('affected_customers')} customers.")

        elif table == "risk_predictions":
            factors = json.dumps(row.get('contributing_factors', {}))
            return (f"Risk Prediction on {feeder}: Forecasted at {row.get('level')} risk level for a {row.get('horizon')}-hour horizon. "
                    f"Prediction Score: {row.get('score')}. Key contributing factors (SHAP): {factors}.")

        elif table == "fault_events":
            return (f"Electrical Fault on {feeder}: A {row.get('severity')} severity {row.get('type')} fault was recorded.")

        elif table == "intervention_outcomes":
            outage_status = "occurred" if row.get('outage_occured') else "prevented"
            return (f"Intervention Outcome on {feeder}: Operator action '{row.get('action_taken')}' was executed. "
                    f"Over a {row.get('outcome_window_hours')}-hour operational window, an outage {outage_status}. "
                    f"Reinforcement Reward Value: {row.get('reward_value')}.")

        elif table == "alerts":
            return (f"Operator Alert on {feeder}: {row.get('severity')} severity {row.get('type')}. "
                    f"System Message: {row.get('message')}.")

        return ""

    async def get_embedding(self, text: str) -> list[float]:
        """Fetches the 1024-dimensional vector from HF Serverless API with retry logic."""
        for attempt in range(5):
            try:
                # The SDK automatically targets the feature-extraction pipeline
                response = await self.hf_client.feature_extraction(
                    text, 
                    model="BAAI/bge-m3"
                )
                
                # The response is typically a numpy-like list of floats
                # If it's nested (batch processing format), extract the flat list
                if isinstance(response, list) and len(response) > 0 and isinstance(response[0], list):
                    return response[0]
                return response
                
            except Exception as e:
                # Check if it's a cold start / 503 error
                error_str = str(e).lower()
                if "503" in error_str or "loading" in error_str:
                    wait_time = 2 ** attempt
                    logger.warning(f"HF Model loading. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                
                logger.error(f"HF API Error: {str(e)}")
                raise e
                
        raise RuntimeError("Failed to fetch embedding from cloud API after 5 attempts.")

    async def process_record(self, conn, table: str, record_id: str):
        """Fetches the record, generates the semantic vector via API, and commits it back."""
        query = f"""
            SELECT t.*, f.name AS feeder_name 
            FROM {table} t
            LEFT JOIN feeders f ON t.feeder_id = f.id
            WHERE t.id = $1
        """
        row = await conn.fetchrow(query, record_id)

        if not row:
            logger.warning(f"Record {record_id} not found in {table}. Skipping.")
            return

        # 1. Serialize context
        context_text = self.serialize_row(table, dict(row))
        if not context_text:
            return

        # 2. Compute 1024-dimension BGE-M3 embedding (Cloud API)
        try:
            embedding = await self.get_embedding(context_text)
        except Exception as e:
            logger.error(f"Skipping record {record_id} due to API failure: {e}")
            return

        # 3. Commit vector and tsvector back to the database
        update_query = f"""
            UPDATE {table} 
            SET embedding = $1, 
                search_text = to_tsvector('english', $2)
            WHERE id = $3
        """
        await conn.execute(update_query, embedding, context_text, record_id)
        logger.info(f"Successfully vectorized {table} record: {record_id}")

    async def run_backfill(self):
        """Scans for legacy rows without embeddings and processes them."""
        logger.info("Initiating database backfill for missing embeddings via Cloud API...")
        tables = ["anomalies", "outage_events", "risk_predictions", "fault_events", "intervention_outcomes", "alerts"]

        conn = await self.connect_db()
        try:
            for table in tables:
                records = await conn.fetch(f"SELECT id FROM {table} WHERE embedding IS NULL")
                if records:
                    logger.info(f"Found {len(records)} unvectorized rows in {table}.")
                    for record in records:
                        await self.process_record(conn, table, record['id'])
                        # 0.5s delay protects against hitting the free tier API rate limits during heavy backfills
                        await asyncio.sleep(0.5)
        finally:
            await conn.close()
        logger.info("Backfill complete.")

    async def listen_for_notifications(self):
        """Establishes pub/sub listener for real-time vectorization."""
        conn = await self.connect_db()

        async def notification_handler(connection, pid, channel, payload):
            try:
                data = json.loads(payload)
                table = data.get("table")
                record_id = data.get("record_id")

                logger.info(f"Received notification: {table} -> {record_id}")
                asyncio.create_task(self.process_record(connection, table, record_id))
            except Exception as e:
                logger.error(f"Failed to handle notification payload: {e}")

        await conn.add_listener("grid_embedding_channel", notification_handler)
        logger.info("Listening on 'grid_embedding_channel'. Waiting for database events...")

        try:
            while True:
                await asyncio.sleep(3600)
        finally:
            await conn.remove_listener("grid_embedding_channel", notification_handler)
            await conn.close()
            # AsyncInferenceClient doesn't require explicit aclose() like httpx

async def main():
    pipeline = EmbeddingPipeline()

    # 1. Execute cold-start backfill
    await pipeline.run_backfill()

    # 2. Transition into real-time listening mode
    await pipeline.listen_for_notifications()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Embedding pipeline stopped by user.")