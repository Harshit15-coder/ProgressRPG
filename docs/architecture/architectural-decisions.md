# Architectural Decisions (Non-obvious)

This page captures non-obvious decisions and constraints for backend maintainers.

## 1) API schema documentation is separated from internal architecture docs

- **Decision**: Keep API reference generation in `drf-spectacular` flows; keep this MkDocs space focused on internal maintainership docs.
- **Why**: Reduces duplication and avoids drift between generated API schema and hand-authored docs.

## 2) Backend uses both synchronous request handling and asynchronous workers

- **Decision**: Use Django request/response paths for user-facing API interactions, and Celery for deferred/background workloads.
- **Why**: Keeps user requests responsive and isolates retries/scheduling concerns.

## 3) Realtime/event-driven behavior relies on Channels/Redis stack

- **Decision**: Keep realtime concerns isolated from core domain logic where possible.
- **Why**: Preserves testability and allows fallback behavior for non-realtime paths.

## 4) Dependency lock file is source-of-truth for deploy reproducibility

- **Decision**: Maintain pinned backend dependencies in `requirements.txt` generated from `requirements.in`.
- **Why**: Improves deterministic builds and deploy consistency.

## 5) Deployment includes automatic database migration step

- **Decision**: Run migrations as part of pre-deploy (`scripts/pre-deploy.sh`).
- **Why**: Ensures schema compatibility for newly deployed application code.

---

## 6) Files are stored as raw data in the database (StoredFile), not object storage

- **Decision**: File uploads live in Postgres via StoredFile/DatabaseFileStorage, not S3-equivalent object storage.
- **Why**: Avoided setting up static object storage at implementation time. Known to need revisiting — not a permanent choice.

## How to add a new decision record

When adding non-obvious architectural behavior:

1. Add a concise title
2. Record the decision itself
3. Record the motivation and tradeoffs
4. Link to related code paths/PRs
