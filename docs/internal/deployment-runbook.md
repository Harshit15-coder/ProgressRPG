# Deployment Runbook (Basic)

This is a lightweight runbook for backend deployment and immediate verification.

## Preconditions

- Deployment target is healthy (service/container platform operational)
- Required secrets/environment variables are present
- Database is reachable
- Redis/broker is reachable (if using Celery/Channels)

## Deployment steps

1. **Choose release commit**
   - Confirm tested commit SHA and branch policy (`development` -> release flow as applicable)
2. **Build and deploy application image/artifact**
   - Follow platform-specific process (Render/container build/etc.)
3. **Run migrations**
   - This repo includes `scripts/pre-deploy.sh` which runs:

   ```bash
   python manage.py migrate
   ```
4. **Restart application services**
   - Web/API process
   - Worker/scheduler processes (if applicable)

## Post-deploy verification checklist

- Health endpoint or basic request returns success
- Django admin/API login/auth flow works
- A representative API endpoint returns expected response
- Background jobs enqueue and execute
- Error monitoring shows no immediate regression spike

## Rollback guidance (basic)

- Roll back to previously known-good deployment artifact
- Re-run service restart to ensure all processes are on rollback version
- If a migration is backward-incompatible, follow project-specific DB rollback procedure before re-deploying old code

## Operational notes

- Keep migrations small and reversible where feasible
- Prefer additive schema changes prior to destructive cleanups
- Announce deploy windows for higher-risk changes
