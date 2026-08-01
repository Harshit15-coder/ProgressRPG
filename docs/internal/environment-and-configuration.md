# Environment Variables and Configuration

This page documents key runtime configuration for the Django backend.

> Note: exact values differ by environment. Do not commit secrets.

## Core Django runtime

- `DJANGO_SETTINGS_MODULE`
  - Selects the settings module (for example, local development settings)
- `SECRET_KEY`
  - Required for Django cryptographic signing/session security
- `DEBUG`
  - Development-only debug behavior; should be disabled in production
- `ALLOWED_HOSTS`
  - Comma-separated host/domain allowlist for incoming requests

## Database

Common patterns in this repo include Django database URL parsing packages (`dj-database-url`) and PostgreSQL drivers.

Typical variables:

- `DATABASE_URL`
  - Full connection string for the primary Postgres database

## Cache / broker / async execution

Project dependencies indicate Redis + Celery + Channels usage. See [architectural-decisions.md #2](architectural-decisions.md) (sync request handling vs. Celery for background work) and [#3](architectural-decisions.md) (Channels/Redis for realtime, isolated from core domain logic) for why this split exists.

Typical variables:

- `REDIS_URL`
  - Redis connection for cache/broker/channel layer components
- `CELERY_BROKER_URL`
  - Broker URL for Celery workers (often Redis)
- `CELERY_RESULT_BACKEND`
  - Optional Celery result backend

## Authentication / API integrations

- **Stripe**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — used by `payments/` for checkout and webhook verification. Local webhook testing: `make stripelistener`.
- Email/service provider credentials — see Transactional email below
- Error/telemetry DSN (Sentry)
- Turnstile/site verification keys if anti-bot flows are enabled

## Transactional email

Delivery path: Django's SMTP backend (`django.core.mail.backends.smtp.EmailBackend`)
relaying through **Resend** (`smtp.resend.com:587`), configured in
`progress_rpg/settings/prod.py`. `EMAIL_HOST_USER` is the literal string `resend`
(required by Resend's SMTP relay); `EMAIL_HOST_PASSWORD` is `RESEND_API_KEY`.

- `RESEND_API_KEY`
  - API key used as the SMTP password for the Resend relay
  - **Required in prod**: `prod.py` raises `ImproperlyConfigured` at startup if
    it is unset/empty, so a missing key fails the deploy instead of silently
    skipping SMTP auth (Resend then rejects every send with
    `530 authentication Required`). The Dockerfile's `collectstatic` build step
    passes a dummy value, like `SECRET_KEY`.
- `DEFAULT_FROM_EMAIL` / `SERVER_EMAIL`
  - Set to `Progress RPG <noreply@mail.progressrpg.com>` in prod

Web and Celery worker must share the same env vars — confirmation emails for
signup (`ACCOUNT_EMAIL_VERIFICATION = "mandatory"`) are queued through Celery
(`users/adapters.py`), so a healthy worker with matching config is required
for delivery, not just the web service.

Verify delivery with `python manage.py send_test_email --to <address>` —
confirmed working end-to-end in staging (2026-07-09).

This relay was previously SendGrid; it was switched to Resend (see
`7ac194a`) after the initial SendGrid SMTP fix in #272.

## Recommended environment management

- Keep an `.env.example` up-to-date with non-secret placeholder values
- Load secrets via deployment platform secret store (not git)
- Validate required variables at startup where possible
- Separate variables by concern (django, db, redis, celery, providers)
