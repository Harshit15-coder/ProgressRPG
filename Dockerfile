# syntax=docker/dockerfile:1

ARG PYTHON_VERSION=3.12

# --------------------------
# Builder stage: compile dependencies
# --------------------------
FROM python:${PYTHON_VERSION}-slim AS builder

# Install build dependencies first (cached separately from app code)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
        gdal-bin \
        libgdal-dev \
        build-essential \
        gcc \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV GDAL_LIBRARY_PATH=/usr/lib/libgdal.so

# Copy ONLY requirements.txt (not app code) so pip install layer caches independently
COPY requirements.txt /tmp/requirements.txt

# Use BuildKit cache mount for pip (persistent across builds)
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --user --no-warn-script-location --no-compile --root-user-action=ignore \
    -r /tmp/requirements.txt


# --------------------------
# Runtime base stage: minimal production runtime
# --------------------------
FROM python:${PYTHON_VERSION}-slim AS runtime-base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV GDAL_LIBRARY_PATH=/usr/lib/libgdal.so
ENV PATH="/usr/local/bin:$PATH"

# Install runtime-only system dependencies BEFORE app code (better cache)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        gdal-bin \
        libgdal-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create app user BEFORE copying code (avoid invalidating on code changes)
ARG UID=1000
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/home/appuser" \
    --shell "/bin/bash" \
    --uid "${UID}" \
    appuser \
    && mkdir -p /home/appuser \
    && chown -R appuser:appuser /home/appuser

# Copy pre-built Python packages from builder stage
COPY --from=builder --chown=appuser:appuser /root/.local /home/appuser/.local
ENV PATH="/home/appuser/.local/bin:$PATH"

# Copy application files (changes frequently, so last in layer chain)
COPY --chown=appuser:appuser . .
COPY --chown=appuser:appuser --chmod=755 entrypoint.sh /app/entrypoint.sh

RUN mkdir -p /app/staticfiles && chown appuser:appuser /app/staticfiles

USER appuser

ENTRYPOINT ["/app/entrypoint.sh"]


# --------------------------
# Celery worker service
# --------------------------
FROM runtime-base AS celery

CMD ["celery", "-A", "progress_rpg", "worker", "--loglevel=info"]


# --------------------------
# Celery Beat scheduler service
# --------------------------
FROM runtime-base AS celery-beat

CMD ["celery", "-A", "progress_rpg", "beat", "--loglevel=info", "--scheduler", "django_celery_beat.schedulers:DatabaseScheduler"]


# --------------------------
# Web service: Django ASGI server (must be last — Render builds final stage by default)
# --------------------------
FROM runtime-base AS web

EXPOSE 8000

ENV PORT=8000
ENV DJANGO_SETTINGS_MODULE=progress_rpg.settings.prod

RUN SECRET_KEY=dummy DATABASE_URL=postgres://dummy:dummy@localhost/dummy python manage.py collectstatic --noinput --clear

CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "progress_rpg.asgi:application"]
