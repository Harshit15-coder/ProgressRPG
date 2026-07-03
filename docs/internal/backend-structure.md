# Backend Structure and Responsibilities

This project uses Django as the backend API/service layer. The repository also includes frontend and auxiliary tooling, but this page focuses on the backend structure.

## Top-level areas relevant to backend maintainers

- `progress_rpg/` — Django project package (settings, URL routing, ASGI/WSGI entrypoints)
- Django app directories at repo root (for example: domain apps such as character/progression/activity features)
- `scripts/` — operational scripts used by deploy/runtime workflows
- `docs/` — existing engineering docs and notes
- `requirements.in` / `requirements.txt` — Python dependency source and locked dependency set

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
