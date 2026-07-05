import os
import random
import string
import logging

from locust import HttpUser, between, task
from locust.exception import StopUser


# -----------------------
# Config
# -----------------------
INVITE_CODE = os.getenv("LOCUST_INVITE_CODE", "TESTCODE")
TURNSTILE_TOKEN = os.getenv("LOCUST_TURNSTILE_TOKEN", "load-test-token")
PASSWORD = os.getenv("LOCUST_PASSWORD", "TestPassword123!")
LOGIN_EMAIL = os.getenv("DJANGO_SUPERUSER_EMAIL", "")
LOGIN_PASSWORD = os.getenv("DJANGO_SUPERUSER_PASSWORD", "")
SCENARIO = os.getenv("LOCUST_SCENARIO", "all").strip().lower()

LOG_LEVEL = os.getenv("LOCUST_LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("locust")

RUN_SIGNUP = SCENARIO in ("all", "signup")
RUN_BOOTSTRAP = SCENARIO in ("all", "bootstrap")


# -----------------------
# Helpers
# -----------------------
def random_email():
    return "user_" + "".join(random.choices(string.ascii_lowercase, k=10)) + "@test.com"


# -----------------------
# Base class (shared logic)
# -----------------------
class BaseUser(HttpUser):
    """
    Shared configuration for all Locust user types.
    """

    abstract = True
    host = os.getenv("LOCUST_HOST", "http://localhost:8000")
    wait_time = between(0.1, 0.5)

    def authenticate_with_jwt(self, email=None, password=None):
        """Authenticate via JWT and attach the bearer token to this user's client."""
        auth_email = email or LOGIN_EMAIL
        auth_password = password or LOGIN_PASSWORD

        if not auth_email or not auth_password:
            return False

        with self.client.post(
            "/api/v1/auth/jwt/create/",
            json={"email": auth_email, "password": auth_password},
            catch_response=True,
            name="jwt_create",
        ) as response:
            if response.status_code != 200:
                response.failure(
                    f"login failed: {response.status_code} {response.text}"
                )
                logger.error(
                    "Bootstrap login failed | status=%s | email=%s | body=%s",
                    response.status_code,
                    auth_email,
                    response.text,
                )
                return False

            try:
                token = response.json().get("access_token")
            except ValueError:
                response.failure("invalid login json response")
                logger.error("Bootstrap login returned non-JSON response")
                return False

            if not token:
                response.failure(
                    f"missing access_token in login response: {response.text}"
                )
                logger.error(
                    "Bootstrap login missing access_token | body=%s", response.text
                )
                return False

            self.client.headers.update({"Authorization": f"Bearer {token}"})
            response.success()
            return True


# -----------------------
# 1. SIGNUP LOAD TEST (existing behaviour preserved)
# -----------------------
class SignupUser(BaseUser):
    abstract = not RUN_SIGNUP
    tags = ["signup"]

    def on_start(self):
        logger.info(
            "Signup test starting | invite_code=%s | turnstile_len=%s | password_len=%s",
            INVITE_CODE,
            len(TURNSTILE_TOKEN or ""),
            len(PASSWORD or ""),
        )

    @task
    def signup(self):
        email = random_email()

        payload = {
            "email": email,
            "password1": PASSWORD,
            "password2": PASSWORD,
            "invite_code": INVITE_CODE,
            "agree_to_terms": True,
            "turnstile_token": TURNSTILE_TOKEN,
        }

        with self.client.post(
            "/api/v1/auth/registration/",
            json=payload,
            catch_response=True,
            name="signup",
        ) as response:

            if response.status_code in (200, 201):
                response.success()
                logger.debug("Signup success | email=%s", email)
                return

            try:
                detail = response.json()
            except ValueError:
                detail = response.text

            logger.error(
                "Signup failed | status=%s | email=%s | body=%s",
                response.status_code,
                email,
                detail,
            )
            response.failure(f"{response.status_code}: {detail}")


# -----------------------
# 2. PLACEHOLDER: FETCH INFO LOAD TEST (next step)
# -----------------------
class BootstrapUser(BaseUser):
    abstract = not RUN_BOOTSTRAP
    tags = ["bootstrap"]
    wait_time = between(1, 3)

    def on_start(self):
        if not self.authenticate_with_jwt():
            raise StopUser(
                "Set LOCUST_LOGIN_EMAIL and LOCUST_LOGIN_PASSWORD to run bootstrap tasks"
            )

    @task
    def fetch_info(self):
        self.client.get("/api/v1/fetch_info/", name="fetch_info")
