from django.conf import settings
from django.core.checks import Error, Tags, register
from django.core.exceptions import ImproperlyConfigured

# Settings that read a secret from the environment with a silent empty-string
# fallback (`os.environ.get(name, "")`), so a missing value doesn't crash at
# import time — it just makes the dependent feature fail at runtime instead.
# Only checked under `manage.py check --deploy`, so unrelated commands
# (migrate, shell, Celery worker/beat boot) aren't affected by a missing var.
REQUIRED_PROD_SETTINGS = [
    ("SECRET_KEY", "Required to sign sessions, cookies, and tokens."),
    ("DATABASE_URL", "Required to connect to Postgres."),
    (
        "EMAIL_HOST_PASSWORD",
        "Set via RESEND_API_KEY. Without it Django skips SMTP auth and Resend "
        "rejects every email with '530 authentication Required'.",
    ),
    (
        "STRIPE_SECRET_KEY",
        "Required for server-side Stripe API calls (checkout, subscription sync, webhooks).",
    ),
    (
        "STRIPE_PUBLISHABLE_KEY",
        "Required for the frontend to initialize Stripe.js.",
    ),
    (
        "STRIPE_WEBHOOK_SECRET",
        "Required to verify Stripe webhook signatures; without it webhook events are rejected.",
    ),
]


@register(Tags.security, deploy=True)
def check_required_prod_settings(app_configs, **kwargs):
    errors = []
    for setting_name, hint in REQUIRED_PROD_SETTINGS:
        try:
            # SECRET_KEY raises ImproperlyConfigured on access when empty
            # (Django validates it itself); treat that the same as unset.
            value = getattr(settings, setting_name, "")
        except ImproperlyConfigured:
            value = ""
        if not value:
            errors.append(
                Error(
                    f"settings.{setting_name} is not set.",
                    hint=hint,
                    id="core.E001",
                )
            )
    return errors
