from typing import List, Dict, Any
from pydantic import UUID4
import asyncpg

async def execute_hybrid_search(
    conn: asyncpg.Connection,
    feeder_id: UUID4,
    query_text: str,
    query_embedding: List[float],
    limit: int = 5,
    rrf_k: int = 60
) -> List[Dict[str, Any]]:
    """
    Executes a database-native Reciprocal Rank Fusion (RRF) combining semantic 
    cosine similarity (pgvector) and lexical full-text search (tsvector).
    """
    
    # Format embedding array into PostgreSQL vector literal format
    vector_literal = f"[{','.join(map(str, query_embedding))}]"
    
    sql_query = """
    WITH semantic_search AS (
        SELECT 
            record_id,
            source_table,
            metric_snippet,
            ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) AS rank
        FROM grid_document_store
        WHERE feeder_id = $2
        ORDER BY embedding <=> $1::vector
        LIMIT 20
    ),
    lexical_search AS (
        SELECT 
            record_id,
            source_table,
            metric_snippet,
            ROW_NUMBER() OVER (ORDER BY ts_rank(fts_vector, websearch_to_tsquery('english', $3)) DESC) AS rank
        FROM grid_document_store
        WHERE feeder_id = $2 
          AND fts_vector @@ websearch_to_tsquery('english', $3)
        ORDER BY rank
        LIMIT 20
    )
    SELECT 
        COALESCE(s.record_id, l.record_id) AS record_id,
        COALESCE(s.source_table, l.source_table) AS source_table,
        COALESCE(s.metric_snippet, l.metric_snippet) AS metric_snippet,
        (COALESCE(1.0 / ($5 + s.rank), 0.0) + COALESCE(1.0 / ($5 + l.rank), 0.0)) AS rrf_score
    FROM semantic_search s
    FULL OUTER JOIN lexical_search l ON s.record_id = l.record_id
    ORDER BY rrf_score DESC
    LIMIT $4;
    """

    records = await conn.fetch(
        sql_query,
        vector_literal,
        feeder_id,
        query_text,
        limit,
        rrf_k
    )
    
    return [dict(record) for record in records]