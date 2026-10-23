"""
Unit and Integration Verification Suite for Local BAAI/bge-m3 Embedding Pipeline.
Validates:
1. Thread constraints: OMP_NUM_THREADS, MKL_NUM_THREADS, torch.get_num_threads() == 2.
2. Complete removal of huggingface_hub client.
3. Singleton model instantiation in EmbeddingPipeline.
4. Async offloading via asyncio.run_in_executor and functools.partial.
5. Deterministic output shape: 1024-dimensional normalized vector (list[float]).
6. Non-blocking concurrency: event loop serves concurrent tasks while embedding is computed.
7. Error handling and propagation.
"""

import asyncio
import inspect
import math
import os
import sys
import unittest
from pathlib import Path

# Add parent directory to sys.path so imports resolve
CURRENT_DIR = Path(__file__).resolve().parent
PARENT_DIR = CURRENT_DIR.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))

import torch
from retrieval.embedding_pipeline import EmbeddingPipeline


class TestLocalEmbeddingPipeline(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        print("\n=== Initializing TestLocalEmbeddingPipeline Suite ===")
        cls.pipeline = EmbeddingPipeline()

    def test_01_thread_constraints_applied(self):
        """Verify environment variables and PyTorch CPU thread capping."""
        self.assertEqual(os.environ.get("OMP_NUM_THREADS"), "2")
        self.assertEqual(os.environ.get("MKL_NUM_THREADS"), "2")
        self.assertEqual(torch.get_num_threads(), 2)
        print("PASS: PyTorch threads constrained to 2 CPU threads.")

    def test_02_huggingface_hub_removed(self):
        """Verify huggingface_hub client is completely excised from the pipeline module."""
        import retrieval.embedding_pipeline as ep_module
        
        # Check module source code does not import AsyncInferenceClient
        source = inspect.getsource(ep_module)
        self.assertNotIn("AsyncInferenceClient", source)
        self.assertNotIn("from huggingface_hub import", source)
        
        # Check instance has no hf_client
        self.assertFalse(hasattr(self.pipeline, "hf_client"))
        print("PASS: huggingface_hub.AsyncInferenceClient completely removed.")

    def test_03_singleton_model_instantiation(self):
        """Verify model is instantiated once as a singleton attached to the class instance."""
        self.assertTrue(hasattr(self.pipeline, "model"))
        from sentence_transformers import SentenceTransformer
        self.assertIsInstance(self.pipeline.model, SentenceTransformer)
        
        # Second pipeline instance shares the exact same singleton instance in RAM
        pipeline_2 = EmbeddingPipeline()
        self.assertIs(self.pipeline.model, pipeline_2.model)
        print("PASS: SentenceTransformer singleton instantiated and shared identically across instances.")

    def test_04_async_executor_offloading_used(self):
        """Verify get_embedding uses asyncio.get_running_loop and run_in_executor."""
        source = inspect.getsource(self.pipeline.get_embedding)
        self.assertIn("run_in_executor", source)
        self.assertIn("functools.partial", source)
        print("PASS: get_embedding utilizes run_in_executor with functools.partial.")

    def test_05_embedding_generation_and_dimensions(self):
        """Verify embedding generates a 1024-dimensional normalized float list."""
        async def run_test():
            query = "Grid anomaly on Feeder-9: Critical transformer temperature spike 115C."
            vector = await self.pipeline.get_embedding(query=query)
            
            self.assertIsInstance(vector, list)
            self.assertEqual(len(vector), 1024)
            self.assertIsInstance(vector[0], float)
            
            # Check L2 normalization (norm should be ~1.0)
            l2_norm = math.sqrt(sum(x * x for x in vector))
            self.assertAlmostEqual(l2_norm, 1.0, places=3)
            return vector

        vector = asyncio.run(run_test())
        print(f"PASS: Generated 1024-dim embedding with L2 norm: {math.sqrt(sum(x * x for x in vector)):.4f}")

    def test_06_concurrent_event_loop_non_blocking(self):
        """Verify the event loop remains responsive while the model is computing an embedding."""
        async def heartbeat_counter(stop_event, counter_box):
            while not stop_event.is_set():
                counter_box[0] += 1
                await asyncio.sleep(0.01)

        async def run_concurrency_test():
            stop_event = asyncio.Event()
            counter_box = [0]
            
            # Launch concurrent background heartbeat
            heartbeat_task = asyncio.create_task(heartbeat_counter(stop_event, counter_box))
            
            # Execute embedding
            await self.pipeline.get_embedding("Simulated concurrent feeder load spike query.")
            
            # Stop heartbeat
            stop_event.set()
            await heartbeat_task
            
            return counter_box[0]

        ticks = asyncio.run(run_concurrency_test())
        self.assertGreater(ticks, 0, "Event loop was starved! Heartbeat ticks must be > 0.")
        print(f"PASS: Event loop non-blocking: {ticks} concurrent ticks recorded during inference.")

    def test_07_empty_query_handling(self):
        """Verify empty input returns empty list without crashing."""
        async def run_empty():
            return await self.pipeline.get_embedding("")

        result = asyncio.run(run_empty())
        self.assertEqual(result, [])
        print("PASS: Empty query safely handled.")


if __name__ == "__main__":
    unittest.main()
