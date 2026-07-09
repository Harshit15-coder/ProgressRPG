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

Project dependencies indicate Redis + Celery + Channels usage.

Typical variables:

- `REDIS_URL`
  - Redis connection for cache/broker/channel layer components
- `CELERY_BROKER_URL`
  - Broker URL for Celery workers (often Redis)
- `CELERY_RESULT_BACKEND`
  - Optional Celery result backend

## Authentication / API integrations

Based on installed packages, backend deploys may require:

- Email/service provider credentials (see Transactional email below)
- Payment provider credentials (Stripe secret/public settings where applicable)
- Error/telemetry DSN (Sentry)
- Turnstile/site verification keys if anti-bot flows are enabled

## Transactional email

Delivery path: Django's SMTP backend (`django.core.mail.backends.smtp.EmailBackend`)
relaying through **Resend** (`smtp.resend.com:587`), configured in
`progress_rpg/settings/prod.py`. `EMAIL_HOST_USER` is the literal string `resend`
(required by Resend's SMTP relay); `EMAIL_HOST_PASSWORD` is `RESEND_API_KEY`.

- `RESEND_API_KEY`
  - API key used as the SMTP password for the Resend relay
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
