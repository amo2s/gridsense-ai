import asyncio
import json
import logging
import os
from datetime import datetime
import asyncpg
from pgvector.asyncpg import register_vector
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

# 1. Load environment variables into memory
load_dotenv()

# Configure production logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("GridSense-Embedding-Pipeline")

# 2. Strict environment read (Raises KeyError if missing instead of silent fallback)
DB_DSN = os.environ["DATABASE_URL"]

class EmbeddingPipeline:
    def __init__(self):
        logger.info("Initializing BGE-M3 model on CPU (1024 dimensions) from local storage...")
        # Offline architecture: strictly loading from the local models/bge-m3 directory. 
        # This will fail if the CLI download is not complete.
        self.model = SentenceTransformer('./models/bge-m3', device='cpu')
        logger.info("Local model loaded successfully.")

    async def connect_db(self):
        """Establish async database connection and register pgvector."""
        conn = await asyncpg.connect(DB_DSN)
        await register_vector(conn)
        return conn

    def serialize_row(self, table: str, row: dict) -> str:
        """
        Transforms raw database columns into a highly semantic paragraph.
        This narrative structure ensures BGE-M3 captures operational context, not just keywords.
        """
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

    async def process_record(self, conn, table: str, record_id: str):
        """Fetches the record, generates the semantic vector, and commits it back."""
        # Query the specific table and join the feeders table to get the human-readable feeder name
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

        # 2. Compute 1024-dimension BGE-M3 embedding (CPU bound)
        # normalize_embeddings=True aligns with HNSW cosine distance operations
        embedding = self.model.encode(context_text, normalize_embeddings=True).tolist()

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
        logger.info("Initiating database backfill for missing embeddings...")
        tables = ["anomalies", "outage_events", "risk_predictions", "fault_events", "intervention_outcomes", "alerts"]
        
        conn = await self.connect_db()
        try:
            for table in tables:
                records = await conn.fetch(f"SELECT id FROM {table} WHERE embedding IS NULL")
                if records:
                    logger.info(f"Found {len(records)} unvectorized rows in {table}.")
                    for record in records:
                        await self.process_record(conn, table, record['id'])
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
                # Process strictly in the background without blocking the listener connection
                asyncio.create_task(self.process_record(connection, table, record_id))
            except Exception as e:
                logger.error(f"Failed to handle notification payload: {e}")

        await conn.add_listener("grid_embedding_channel", notification_handler)
        logger.info("Listening on 'grid_embedding_channel'. Waiting for database events...")
        
        # Keep the connection alive infinitely
        try:
            while True:
                await asyncio.sleep(3600)
        finally:
            await conn.remove_listener("grid_embedding_channel", notification_handler)
            await conn.close()

async def main():
    pipeline = EmbeddingPipeline()
    
    # 1. Execute cold-start backfill
    await pipeline.run_backfill()
    
    # 2. Transition into real-time listening mode
    await pipeline.listen_for_notifications()

if __name__ == "__main__":
    asyncio.run(main())