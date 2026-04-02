from sentence_transformers import SentenceTransformer
import numpy as np

# ── Load model once at startup ────────────────────────────────────────
print("Loading embedding model...")
model = SentenceTransformer("all-MiniLM-L6-v2")
print("Embedding model loaded")

# ── Single embedding ──────────────────────────────────────────────────
def get_embedding(text: str) -> list:
    if not text or not text.strip():
        raise ValueError("Cannot embed empty text")

    embedding = model.encode(
        text,
        normalize_embeddings=True,
        show_progress_bar=False
    )

    return embedding.tolist()

# ── Chunk text into overlapping pieces ───────────────────────────────
def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list:
    if not text or not text.strip():
        return []

    words = text.split()

    if len(words) == 0:
        return []

    chunks = []
    start  = 0

    while start < len(words):
        end   = start + chunk_size
        chunk = " ".join(words[start:end])

        if chunk.strip():
            chunks.append(chunk)

        start = start + chunk_size - overlap

    return chunks

# ── Batch embeddings ──────────────────────────────────────────────────
def get_embeddings_batch(texts: list) -> list:
    if not texts:
        return []

    texts = [t for t in texts if t and t.strip()]

    if not texts:
        return []

    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=32
    )

    return embeddings.tolist()

#TODO: Add logger 