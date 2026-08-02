# Backend Structure and Responsibilities

This project uses Django as the backend API/service layer. The repository also includes frontend and auxiliary tooling, but this page focuses on the backend structure.

## Top-level areas relevant to backend maintainers

- `progress_rpg/` — Django project package (settings, URL routing, ASGI/WSGI entrypoints)
- Django app directories at repo root (see table below)
- `scripts/` — operational scripts used by deploy/runtime workflows
- `docs/` — existing engineering docs and notes
- `requirements.in` / `requirements.txt` — Python dependency source and locked dependency set

For a file-level tree of each app and of `frontend/src/`, see [repo-structure.md](repo-structure.md).

## Django apps

All API routes live under `/api/v1/` (see `api/urls.py`) using DRF routers.

| App | Purpose |
|---|---|
| `api/` | Core API endpoints, auth (JWT via dj-rest-auth + simplejwt), registration |
| `character/` | Character model, `PlayerCharacterLink` (user↔character pairing), Behaviour |
| `core/`      | DB-backed file storage (`StoredFile`, `DatabaseFileStorage`, `Image`), singleton game-balance config (`GameSettings`), announcements (`Announcement` + queryset, `PlayerAnnouncementState`) |
| `progression/` | Skills, activities (`PlayerActivity`, `CharacterActivity`), leveling, XP |
| `gameplay/` | `QuestTimer`, `ActivityTimer`, WebSocket consumer (`TimerConsumer`), XP modifiers |
| `gameworld/` | World/location data |
| `locations/` | `PopulationCentre` (map data) |
| `economy/`   | Crop growth cycles (`FieldCrop`), goods inventory (`GoodsStock`), per-building daily conversion processing (`GoodsConversionState`) |
| `events/` | Game event system |
| `users/` | `Player` model (extends auth user), player views |
| `payments/` | Stripe webhook + checkout flow |
| `server_management/` | Maintenance mode, admin utilities |
| `progress_rpg/` | Django project settings, ASGI config, middleware |

## Django project package responsibilities

Typical ownership in `progress_rpg/`:

- **Settings**: environment-specific configuration modules under `progress_rpg.settings`
- **Routing**: API and site route composition in Django URL config
- **App/bootstrap wiring**: ASGI/WSGI and startup configuration

## App responsibilities (conceptual)

App responsibilities should stay domain-focused:

- Keep business logic in app services/models rather than view glue
- Keep serializers/views responsible for transport concerns (validation, HTTP mapping)
- Keep cross-cutting concerns (auth, rate limiting, async tasks, metrics) in dedicated modules/apps

## Key cross-app wiring

- `character/signals.py` creates `QuestTimer` and `Behaviour` when a `Character` is saved, and recomputes `can_link` flags on `PlayerCharacterLink` changes.
- Business logic lives in `models.py` and `services/`; views stay thin.
- Celery tasks are defined per-app in `tasks.py` using `@shared_task`. See [architectural-decisions.md #2](architectural-decisions.md) for why sync/async is split this way.
- **WebSocket**: `gameplay/consumers.py` → `TimerConsumer` handles the real-time timer. Route: `ws/profile_<id>/`. Authenticated via JWT. See [architectural-decisions.md #3](architectural-decisions.md) for the rationale behind isolating realtime from core domain logic.
- **API docs**: `/api/docs/` (Swagger) and `/api/schema/` (OpenAPI) via drf-spectacular.

## Supporting platform components

From current dependencies and project setup, backend maintainers should account for:

- **Django REST Framework** + auth extensions for API/auth flows
- **Channels / Daphne / channels-redis** for async/realtime paths
- **Celery** (+ django-celery-beat) for background and scheduled jobs
- **PostgreSQL** and **Redis** for persistent/cache/broker roles
- **drf-spectacular** for API schema docs (explicitly out-of-scope for this internal docs issue)

## Maintenance guidance

- Keep new backend features grouped by domain app, not by technical layer only
- Prefer explicit boundaries between synchronous request handling and async/background work
- Document non-obvious behavior changes in `docs/internal/architectural-decisions.md`
