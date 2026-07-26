"""
PRODUCTION SETTINGS
Django settings for progress_rpg project.

For the full list of settings and their values, see
https://docs.djangoproject.com/en/5.1/ref/settings/
"""

from .base import *
from urllib.parse import quote
from .utils import get_redis_url, get_required_env

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[%(asctime)s] [%(request_id)s] [%(user_id)s] [%(levelname)s] [%(name)s:%(lineno)d] %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
        "simple": {
            "format": "[%(levelname)s] [%(name)s] %(message)s",
        },
    },
    "filters": {
        "require_debug_false": {
            "()": "django.utils.log.RequireDebugFalse",
        },
        "request_context": {
            "()": "progress_rpg.middleware.logging_context.RequestContextFilter",
        },
    },
    "handlers": {
        "console": {
            "level": "INFO",
            "class": "logging.StreamHandler",
            "formatter": "verbose",
            "filters": ["request_context"],
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "errors": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        "general": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "activity": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "django.db.backends": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}

DEBUG = os.environ.get("DEBUG", "False").lower() in ("true", "1", "yes")
DB_NAME = os.environ.get("DB_NAME")
DB_USER = os.environ.get("DB_USER")
DB_PASSWORD = os.environ.get("DB_PASSWORD")
DB_HOST = os.environ.get("DB_HOST")
DB_PORT = os.environ.get("DB_PORT")


EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
DEFAULT_FROM_EMAIL = "Progress RPG <noreply@mail.progressrpg.com>"
SERVER_EMAIL = "Progress RPG <noreply@mail.progressrpg.com>"

EMAIL_HOST = "smtp.resend.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_USE_SSL = False
EMAIL_HOST_USER = "resend"  # Resend SMTP requires this literal string as the username
EMAIL_HOST_PASSWORD = get_required_env(
    "RESEND_API_KEY",
    hint="Without it Django skips SMTP auth and Resend rejects every email "
    "with '530 authentication Required'. Set it in the service's env group.",
)

print("DEBUG:", DEBUG, file=sys.stderr)

REGISTRATION_ENABLED = True

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.1/howto/deployment/checklist/

SECRET_KEY = os.environ.get("SECRET_KEY")

ALLOWED_HOSTS = os.environ.get(
    "ALLOWED_HOSTS",
    "staging.progressrpg.com,app.progressrpg.com,progressrpg.onrender.com",
).split(",")
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "https://staging.progressrpg.com,https://app.progressrpg.com,https://progressrpg.onrender.com",
).split(",")
CSRF_TRUSTED_ORIGINS = os.environ.get(
    "CSRF_TRUSTED_ORIGINS",
    "https://staging.progressrpg.com,https://app.progressrpg.com,https://progressrpg.onrender.com",
).split(",")

# ------------------------------
# Database
# https://docs.djangoproject.com/en/5.1/ref/settings/#databases
# ------------------------------


# DB_NAME = os.getenv("DB_NAME", "progressrpg_staging")
# DB_USER = os.getenv("DB_USER", default="duncan")
# DB_PASSWORD = os.getenv("DB_PASSWORD", "")
# DB_PORT = os.getenv("DB_PORT", default=5432)

# IN_DOCKER = is_running_in_docker()

DATABASE_URL = os.environ.get("DATABASE_URL")
# if not DATABASE_URL:
#     # Fallback to explicit DB_* vars for local dev
#     DB_USER = os.environ.get("DB_USER", "duncan")
#     DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
#     DB_NAME = os.environ.get("DB_NAME", "progressrpg")
#     DB_HOST = get_postgres_host()
#     DB_PORT = os.environ.get("DB_PORT", 5432)
#     DATABASE_URL = f"postgres://{DB_USER}:{quote(DB_PASSWORD, safe='')}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

assert DATABASE_URL is not None, "DATABASE_URL is required in production"
db = dj_database_url.parse(DATABASE_URL, conn_max_age=60)
db["ENGINE"] = "django.contrib.gis.db.backends.postgis"
# Required when connecting through pgbouncer in transaction pooling mode;
# harmless on direct connections.
db["DISABLE_SERVER_SIDE_CURSORS"] = True
DATABASES = {"default": db}


REDIS_URL_MOD = get_redis_url(default_db="0")


# ssl_context = ssl.create_default_context()
# ssl_context.check_hostname = False
# ssl_context.verify_mode = ssl.CERT_NONE

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            # socket_timeout must exceed channels_redis's BZPOPMIN brpop_timeout (5s),
            # otherwise redis-py's client-side read timeout races the server-side
            # blocking timeout and randomly raises TimeoutError, killing the consumer.
            "hosts": [{"address": REDIS_URL_MOD, "socket_timeout": 20}],
        },
    },
}

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL_MOD,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}

CELERY_BROKER_URL = REDIS_URL_MOD
CELERY_RESULT_BACKEND = REDIS_URL_MOD

# Session settings
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
SESSION_SAVE_EVERY_REQUEST = False

SESSION_COOKIE_NAME = "sessionid"
# SESSION_COOKIE_DOMAIN = '.progressrpg.com'
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Strict"
SESSION_COOKIE_AGE = 86400  # 24 hours in seconds

CSRF_COOKIE_SECURE = True
# CSRF_COOKIE_DOMAIN = '.progressrpg.com'

# Security settings
SECURE_SSL_REDIRECT = "test" not in sys.argv
SECURE_REDIRECT_EXEMPT: list[str] = []
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

# Frontend is a separate static site; the Vite manifest won't exist in this container
SILENCED_SYSTEM_CHECKS = ["django_vite.W001"]
