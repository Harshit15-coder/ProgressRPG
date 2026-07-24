import os
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from progress_rpg.settings.utils import get_dev_email_backend, get_required_env


class DevEmailBackendSettingsTest(SimpleTestCase):
    def test_defaults_to_console_backend(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                get_dev_email_backend(),
                "django.core.mail.backends.console.EmailBackend",
            )

    def test_allows_explicit_override(self):
        with patch.dict(
            os.environ,
            {"EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend"},
            clear=True,
        ):
            self.assertEqual(
                get_dev_email_backend(),
                "django.core.mail.backends.smtp.EmailBackend",
            )


class RequiredEnvSettingsTest(SimpleTestCase):
    def test_returns_value_when_set(self):
        with patch.dict(os.environ, {"RESEND_API_KEY": "re_123"}, clear=True):
            self.assertEqual(get_required_env("RESEND_API_KEY"), "re_123")

    def test_raises_when_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ImproperlyConfigured):
                get_required_env("RESEND_API_KEY")

    def test_raises_when_empty(self):
        with patch.dict(os.environ, {"RESEND_API_KEY": ""}, clear=True):
            with self.assertRaises(ImproperlyConfigured):
                get_required_env("RESEND_API_KEY")

    def test_hint_is_appended_to_error(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesMessage(
                ImproperlyConfigured,
                "RESEND_API_KEY environment variable is not set. Set it.",
            ):
                get_required_env("RESEND_API_KEY", hint="Set it.")
