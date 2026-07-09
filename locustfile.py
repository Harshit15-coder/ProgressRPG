import os
import random
import string
import logging
import time

from locust import HttpUser, between, task
from locust.exception import StopUser
import websocket


# -----------------------
# Config
# -----------------------
INVITE_CODE = os.getenv("LOCUST_INVITE_CODE", "TESTCODE")
TURNSTILE_TOKEN = os.getenv("LOCUST_TURNSTILE_TOKEN", "load-test-token")
PASSWORD = os.getenv("LOCUST_PASSWORD", "TestPassword123!")
LOGIN_EMAIL = os.getenv("DJANGO_SUPERUSER_EMAIL", "")
LOGIN_PASSWORD = os.getenv("DJANGO_SUPERUSER_PASSWORD", "")
SCENARIO = os.getenv("LOCUST_SCENARIO", "all").strip().lower()

WS_HOST = os.getenv("LOCUST_WS_HOST", "ws://localhost:8000")
WS_PING_INTERVAL_SECONDS = float(os.getenv("LOCUST_WS_PING_INTERVAL_SECONDS", "5"))
WS_CONNECTION_SECONDS = float(os.getenv("LOCUST_WS_CONNECTION_SECONDS", "30"))
WS_TIMEOUT_SECONDS = float(os.getenv("LOCUST_WS_TIMEOUT_SECONDS", "5"))

LOG_LEVEL = os.getenv("LOCUST_LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("locust")

RUN_SIGNUP = SCENARIO in ("all", "signup")
RUN_BOOTSTRAP = SCENARIO in ("all", "bootstrap")
RUN_TIMER = SCENARIO in ("all", "timer")


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
            self.access_token = token
            response.success()
            return True

    def fetch_player_id(self):
        """Fetch the authenticated player's id via fetch_info, for use in WS routes."""
        with self.client.get(
            "/api/v1/fetch_info/", catch_response=True, name="fetch_info (for ws setup)"
        ) as response:
            if response.status_code != 200:
                response.failure(
                    f"fetch_info failed: {response.status_code} {response.text}"
                )
                return None
            try:
                return response.json()["player"]["id"]
            except (ValueError, KeyError, TypeError):
                response.failure("missing player.id in fetch_info response")
                return None


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


# -----------------------
# 3. TIMER WEBSOCKET LOAD TEST
# -----------------------
class TimerUser(BaseUser):
    """
    Exercises the gameplay timer WebSocket (gameplay/consumers.py TimerConsumer):
    connect, hold the connection open sending periodic pings (which also drive
    the per-ping `record_heartbeat` DB write), then disconnect.
    """

    abstract = not RUN_TIMER
    tags = ["timer"]
    wait_time = between(1, 3)

    def on_start(self):
        if not self.authenticate_with_jwt():
            raise StopUser(
                "Set LOCUST_LOGIN_EMAIL and LOCUST_LOGIN_PASSWORD to run timer tasks"
            )
        self.player_id = self.fetch_player_id()
        if not self.player_id:
            raise StopUser("Could not resolve player id for timer websocket")

    @task
    def timer_session(self):
        url = f"{WS_HOST}/ws/profile_{self.player_id}/?token={self.access_token}"

        start = time.time()
        try:
            ws = websocket.create_connection(url, timeout=WS_TIMEOUT_SECONDS)
        except Exception as exc:
            self.environment.events.request.fire(
                request_type="WS",
                name="timer_connect",
                response_time=(time.time() - start) * 1000,
                response_length=0,
                exception=exc,
            )
            return

        self.environment.events.request.fire(
            request_type="WS",
            name="timer_connect",
            response_time=(time.time() - start) * 1000,
            response_length=0,
        )

        session_end = time.time() + WS_CONNECTION_SECONDS
        try:
            while time.time() < session_end:
                ping_start = time.time()
                try:
                    ws.send('{"type": "ping"}')
                    ws.recv()
                except Exception as exc:
                    self.environment.events.request.fire(
                        request_type="WS",
                        name="timer_ping",
                        response_time=(time.time() - ping_start) * 1000,
                        response_length=0,
                        exception=exc,
                    )
                    break
                else:
                    self.environment.events.request.fire(
                        request_type="WS",
                        name="timer_ping",
                        response_time=(time.time() - ping_start) * 1000,
                        response_length=0,
                    )
                time.sleep(WS_PING_INTERVAL_SECONDS)
        finally:
            try:
                ws.close()
            except Exception:
                pass
