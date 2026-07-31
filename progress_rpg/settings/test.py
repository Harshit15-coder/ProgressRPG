from .base import *
from .utils import (
    get_dev_email_backend,
    get_redis_url,
)


######## TEST-SPECIFIC SETTINGS ###############

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]


LOGGING = {
    "version": 1,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": "WARNING",
        },
    },
}


###############################################
###############################################
######## DEVELOPMENT-SPECIFIC SETTINGS ########
###############################################
###############################################
ROOT_URLCONF = "progress_rpg.urls"


EMAIL_BACKEND = get_dev_email_backend()
DEFAULT_FROM_EMAIL = "Progress RPG <noreply@progressrpg.com>"
SECRET_KEY = os.getenv("SECRET_KEY")

ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "127.0.0.1").replace("\r", "").split(",")
CORS_ALLOWED_ORIGINS = os.getenv(
    "CORS_ALLOWED_ORIGINS", "http://127.0.0.1,http://localhost:8000"
).split(",")
CSRF_TRUSTED_ORIGINS = os.getenv(
    "CSRF_TRUSTED_ORIGINS", "http://127.0.0.1,http://localhost:8000"
).split(",")


DATABASE_URL = os.environ.get("DATABASE_URL")

if DATABASE_URL:
    db = dj_database_url.parse(DATABASE_URL, conn_max_age=0)
    db["ENGINE"] = "django.contrib.gis.db.backends.postgis"
    # Required when connecting through pgbouncer in transaction pooling mode;
    # harmless on direct connections.
    db["DISABLE_SERVER_SIDE_CURSORS"] = True
    DATABASES = {"default": db}
else:
    # Safe fallback for build-time collectstatic
    print("⚠️ No DATABASE_URL set — using dummy SQLite DB", file=sys.stderr)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }

REDIS_URL = get_redis_url(default_db="0")


CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            # socket_timeout must exceed channels_redis's BZPOPMIN brpop_timeout (5s),
            # otherwise redis-py's client-side read timeout races the server-side
            # blocking timeout and randomly raises TimeoutError, killing the consumer.
            "hosts": [{"address": REDIS_URL, "socket_timeout": 20}],
        },
    },
}


CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    }
}


# For local development only
SESSION_ENGINE = "django.contrib.sessions.backends.cache"
SESSION_CACHE_ALIAS = "default"
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
SESSION_SAVE_EVERY_REQUEST = True

SESSION_COOKIE_NAME = "sessionid"
SESSION_COOKIE_DOMAIN = None
SESSION_COOKIE_SECURE = False
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 3600  # 1 hour in seconds

CSRF_COOKIE_DOMAIN = None
CSRF_COOKIE_SECURE = False

SECURE_PROXY_SSL_HEADER = None
SECURE_SSL_REDIRECT = False
SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False

CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"

CELERY_RESULT_BACKEND = REDIS_URL
CELERY_BROKER_URL = REDIS_URL
