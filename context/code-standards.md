# Code Standards

## General

- Keep modules small and single-purpose
- Fix root causes, do not layer workarounds
- Do not mix unrelated concerns in one component, route, or service
- Prefer simple, readable code over clever code — the project owner must be able to follow it
- Add a short comment explaining *why* for any non-obvious logic (especially in the RAG and ingestion pipeline)
- No dead code, commented-out blocks, or unused imports

## TypeScript

- Strict mode is required throughout the project
- Never use `any` — use explicit interfaces or narrowly scoped types
- Define shared shapes (Note, Folder, Chat, Citation) once in `types/` and reuse them
- Validate unknown external input (API responses, file uploads) at system boundaries before trusting it
- Keep types simple: prefer plain `interface` and union types over advanced generics

## React + Vite

- Use function components and hooks only
- Organize by feature (`features/notes`, `features/chat`, `features/viewer`), not by file type
- Use TanStack Query for all server data fetching and caching — no ad hoc `fetch` inside components
- Keep components focused on one job; extract logic into hooks when a component grows
- Components never call Gemini, Postgres, or disk directly — everything goes through the API

## Python / FastAPI

- Type hints are required on every function signature
- Use Pydantic models for every request and response body
- Format and lint with Ruff; code must pass before a unit is considered done
- Routers stay thin: validate, authorize, call a service, return
- Use `async` for I/O-bound endpoints; CPU-heavy or slow work goes to the worker, never the request handler
- Use dependency injection (`Depends`) for auth, DB sessions, and shared services

## Styling

- Use CSS custom property tokens — no hardcoded hex values
- Follow the border radius scale and component rules defined in `ui-context.md`

## API Routes

- All routes live under `/api/v1`
- Validate and parse request input before any logic runs
- Verify the Clerk token and enforce ownership or share permission before any read or mutation
- Return consistent response shapes: success returns the resource or `{ data: ... }`; errors return `{ error: { code, message } }`
- Use correct HTTP status codes (401 unauthenticated, 403 forbidden, 404 not found, 422 invalid input)
- Keep each route handler focused on a single responsibility

## Data and Storage

- Metadata, ownership, sharing, chunks, and embeddings belong in Postgres
- Original files and rendered page images belong on local disk, accessed only through the storage service
- Do not store file bytes in the database; store the relative path and file metadata
- Schema changes go through SQLAlchemy + Alembic migrations — never edit the database by hand
- Redis holds queue and job state only; nothing durable

## Testing and Verification

- Use `pytest` for backend logic, prioritizing: permission checks, retrieval and citation generation, and the "Not covered in your uploaded notes" path
- Frontend is verified manually end to end for now
- A unit is done only when these pass: `ruff check`, `pytest`, `tsc --noEmit`, and `npm run build`

## File Organization

- `apps/web/src/features/` — Feature folders (components, hooks, and API calls for one feature)
- `apps/web/src/components/` — Small shared UI pieces used by multiple features
- `apps/web/src/types/` — Shared TypeScript types
- `apps/api/routers/` — HTTP routes only
- `apps/api/services/` — Business logic (ingestion, RAG, sharing, sync)
- `apps/api/workers/` — Queue consumers for long-running jobs
- `apps/api/llm/` — Provider-agnostic Gemini wrapper
- `apps/api/db/` — Models, migrations, queries
- `apps/api/tests/` — Backend tests
- `storage/` — Local disk root for uploaded and derived files (git-ignored)