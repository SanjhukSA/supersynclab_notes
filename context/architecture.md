# Architecture Context

## Stack

| Layer            | Technology                    | Role                                                                 |
| ---------------- | ----------------------------- | -------------------------------------------------------------------- |
| Frontend         | React + Vite + TypeScript     | PC-first web client: library, upload, chat, split-screen viewer      |
| Backend API      | FastAPI (Python)              | REST API, auth verification, orchestration of ingestion and RAG      |
| Auth             | Clerk                         | Sign-in; Google OAuth for Drive/Classroom linking                    |
| Database         | PostgreSQL + pgvector         | Metadata, ownership, sharing, chunks, embeddings, full-text search   |
| Job Queue        | Redis + background worker     | Runs ingestion (parse, OCR, chunk, embed, classify) off the request  |
| File Storage     | Local disk                    | Original uploads (PDF, Word, images) and derived page images         |
| Document Parsing | PyMuPDF, OpenCV               | Digital PDF text extraction; image cleaning before OCR               |
| LLM / Vision     | Gemini (free tier)            | Chat answers, handwriting OCR, LaTeX reconstruction, classification  |
| Retrieval        | Hybrid search + cross-encoder | Vector + keyword search, then reranking, over parent-document chunks |

## System Boundaries

- `apps/web/` — Frontend only. Renders UI, calls the API, never talks to Postgres, Redis, Gemini, or disk directly.
- `apps/api/routers/` — HTTP layer. Validates input, enforces auth and permissions, delegates to services. No business logic.
- `apps/api/services/` — Business logic: ingestion orchestration, RAG pipeline, sharing, classification, Drive/Classroom sync.
- `apps/api/workers/` — Queue consumers. All long-running work (OCR, embedding, sync) runs here.
- `apps/api/llm/` — The only place that calls Gemini. Exposes a provider-agnostic interface so models can be swapped.
- `apps/api/db/` — Models, migrations, and queries. The only layer that talks to Postgres.
- `storage/` — Local disk root for uploaded and derived files. Accessed only through a storage service, never by raw path elsewhere.

## Storage Model

- **Postgres**: users (mirrored from Clerk), folders, notes (metadata, subject, status), pages, chunks (parent and child), embeddings, citations (page and bbox), chats and messages, share grants.
- **Local disk**: original uploaded files and rendered page images used by the split-screen viewer. Postgres stores only the relative path and file metadata, never file bytes.
- **Redis**: job queue and job state only. Nothing durable lives here; it can be wiped without data loss.

## Auth and Access Model

- Every request carries a Clerk session token, verified by the API before any logic runs.
- Every note, folder, and chat has exactly one owner.
- Sharing is done through share grants on a folder, note, or chat, with one of two roles:
  - **Viewer**: read-only, can download.
  - **Editor**: can modify content and metadata, can download.
- Only the owner can change sharing settings or delete a resource.
- Retrieval is always scoped to the notes the requesting user owns or has been granted access to.

## Invariants

1. Every generated claim in a chat answer, cheat sheet, or PYQ solution carries a citation to a source page and bounding box.
2. Every claim drawn from the student's notes carries a citation (page and bounding box). Claims from general knowledge are clearly distinguished and never presented as coming from the notes. "Notes only" mode answers strictly from notes and returns "Not covered in your uploaded notes" when nothing relevant is found.
