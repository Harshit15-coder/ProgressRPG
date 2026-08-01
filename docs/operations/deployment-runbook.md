# Deployment Runbook (Basic)

This is a lightweight runbook for backend deployment and immediate verification.

## Preconditions

- Deployment target is healthy (service/container platform operational)
- Required secrets/environment variables are present — see `environment-variables.md`
- Database is reachable
- Redis/broker is reachable (if using Celery/Channels)

## Deployment steps

1. **Choose release commit**
   - Staging deploys from `staging`, populated via a periodic PR (base `staging`, head `development`)
   - Production deploys from `main`, populated via a periodic PR (base `main`, head `staging`)
   - `main` is the repo's default branch
2. **Build and deploy application image/artifact**
   - Platform: Render, region `frankfurt` for all services
   - Staging: services `web-staging` / `celery-staging` / `celery-beat-staging`, config `render-staging.yaml`, env group **"Staging env"**
   - Production: services `web` / `celery` / `celery-beat`, config `render.yaml`, env group **"Prod env"**
3. **Run migrations**
   - This repo includes `scripts/pre-deploy.sh` which runs:

   ```bash
   python manage.py migrate
   ```
4. **Restart application services**
   - Web/API process
   - Worker/scheduler processes (`celery`, `celery-beat` for the relevant environment)

## Post-deploy verification checklist

- Health endpoint or basic request returns success
- Django admin/API login/auth flow works
- A representative API endpoint returns expected response
- Background jobs enqueue and execute
- Error monitoring shows no immediate regression spike
- Transactional email sends successfully — see `send_test_email` command in `environment-variables.md`; note the web *and* Celery worker both need matching email config, since confirmation emails are queued through Celery

## Rollback guidance (basic)

- Roll back to previously known-good deployment artifact
- Re-run service restart to ensure all processes are on rollback version
- If a migration is backward-incompatible, follow project-specific DB rollback procedure before re-deploying old code

## Operational notes

- Keep migrations small and reversible where feasible
- Prefer additive schema changes prior to destructive cleanups
- Announce deploy windows for higher-risk changes

## Note on PR workflow

The rule for which branch a *feature* PR should target (normally `development`, with a documented exception for basing on `staging`) is a development workflow concern, not a deployment-execution step — that lives in `CLAUDE.md`, not here.
