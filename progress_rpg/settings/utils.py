from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
import os


def is_running_in_docker():
    return os.environ.get("DOCKER", "").lower() in ("1", "true", "yes")


def get_redis_host():
    in_docker = is_running_in_docker()
    selected_host = (
        os.getenv("REDIS_HOST_DOCKER") if in_docker else os.getenv("REDIS_HOST_LOCAL")
    )
    if selected_host:
        return selected_host
    return os.getenv("REDIS_HOST", "redis" if in_docker else "localhost")


def get_redis_url(default_db="0"):
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        return redis_url

    redis_host = get_redis_host()
    redis_scheme = os.getenv("REDIS_SCHEME", "redis")
    redis_port = os.getenv("REDIS_PORT", "6379")
    redis_db = os.getenv("REDIS_DB", default_db)
    return f"{redis_scheme}://{redis_host}:{redis_port}/{redis_db}"


def get_dev_email_backend():
    return os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")


def get_required_env(name, hint=""):
    """
    Read an env var that must be non-empty, failing at settings import so a
    missing secret breaks the deploy instead of surfacing later at runtime
    (e.g. an unset RESEND_API_KEY makes Django skip SMTP auth and every
    outbound email fails with '530 authentication Required').
    """
    value = os.environ.get(name, "")
    if not value:
        message = f"{name} environment variable is not set"
        if hint:
            message = f"{message}. {hint}"
        raise ImproperlyConfigured(message)
    return value


def get_build_number():
    try:
        base = getattr(settings, "BASE_DIR", os.path.dirname(os.path.dirname(__file__)))
        path = os.path.join(base, "BUILD_NUMBER")
        with open(path, "r") as fh:
            return int(fh.read().strip())
    except Exception:
        return 0
