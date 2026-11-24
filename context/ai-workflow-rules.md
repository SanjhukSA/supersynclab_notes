# AI Workflow Rules

## Approach

Build this project incrementally using a spec-driven workflow. The context files define what to build, how to build it, and the current state of progress. Always implement against these specs — do not infer or invent behavior from scratch.

At the start of every session, read these files in order before writing any code:

1. `project-overview.md` — what the product is and its scope
2. `architecture.md` — stack, boundaries, storage, access model, invariants
3. `code-standards.md` — how code must be written
4. `ui-context.md` — visual language and layout patterns
5. `progress-tracker.md` — what is done, what is next, and open questions

## Scoping Rules

- Work on one feature unit at a time
- Prefer small, verifiable increments over large speculative changes
- Do not combine unrelated system boundaries in a single implementation step
- Build in thin vertical slices (one capability working end to end) rather than finishing one layer at a time

## When to Split Work

Split an implementation step if it combines:

- Frontend changes and backend changes that can be verified independently
- Ingestion pipeline changes and retrieval or chat changes
- Multiple unrelated API routes
- Behavior not clearly defined in the context files

If a change cannot be verified end to end quickly, the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the context files
- If a requirement is ambiguous, resolve it in the relevant context file before implementing
- If a requirement is missing, add it as an open question in `progress-tracker.md` before continuing

## Protected Files

Do not modify the following unless explicitly instructed:

- `components/ui/*` — generated shadcn/ui components
- Alembic migrations that have already been applied — add a new migration instead
- `storage/` — uploaded and derived user files
- `.env` and any file containing secrets
- Third-party library internals

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries
- Storage model decisions
- Code conventions or standards
- UI tokens, palette, or layout patterns
- Feature scope

## Before Moving to the Next Unit

1. The current unit works end to end within its defined scope
2. No invariant defined in `architecture.md` was violated
3. `progress-tracker.md` reflects the completed work
4. `ruff check`, `pytest`, `tsc --noEmit`, and `npm run build` all pass