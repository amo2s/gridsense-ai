import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
import gradio as gr
from sentence_transformers import SentenceTransformer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GridSense-AI-Space")

# Global model container
state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading BAAI/bge-m3 directly inside Hugging Face infrastructure...")
    # Cloud datacenter pulls this in ~20 seconds
    state["model"] = SentenceTransformer("BAAI/bge-m3", device="cpu")
    logger.info("Model loaded successfully.")
    yield
    state.clear()

api = FastAPI(lifespan=lifespan)

class TextPayload(BaseModel):
    texts: List[str]

@api.get("/health")
def health():
    return {"status": "healthy", "model_loaded": "model" in state}

@api.post("/embed")
def generate_embeddings(payload: TextPayload):
    if "model" not in state:
        raise HTTPException(status_code=503, detail="Model is still initializing")
    
    embeddings = state["model"].encode(
        payload.texts, 
        normalize_embeddings=True
    ).tolist()
    return {"embeddings": embeddings}

# Minimal Gradio interface to satisfy the SDK container runtime
with gr.Blocks(title="GridSense AI Engine") as demo:
    gr.Markdown("# GridSense AI Assistant Service")
    gr.Markdown("FastAPI backend running with BGE-M3 (1024 dimensions).")

# Mount Gradio onto the FastAPI application
app = gr.mount_gradio_app(api, demo, path="/")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)