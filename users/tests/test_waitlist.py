from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.db import IntegrityError
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import GameSettings
from users.models import Waitlist
from users.services import waitlist_service

User = get_user_model()


class RegistrationStatusAPITest(APITestCase):
    def setUp(self):
        GameSettings.objects.all().delete()
        self.settings = GameSettings.current()

    def test_registration_open_below_cap(self):
        self.settings.registration_cap = 100
        self.settings.save()
        res = self.client.get("/api/v1/registration_status/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.json()["registration_open"])

    def test_registration_closed_at_cap(self):
        User.objects.create_user(email="a@example.com", password="testpassword123")
        self.settings.registration_cap = User.objects.count()
        self.settings.save()
        res = self.client.get("/api/v1/registration_status/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.json()["registration_open"])

    def test_endpoint_requires_no_auth(self):
        res = self.client.get("/api/v1/registration_status/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class WaitlistJoinAPITest(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_valid_email_creates_waiting_entry(self):
        res = self.client.post(
            "/api/v1/waitlist_join/", {"email": "waiter@example.com"}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        entry = Waitlist.objects.get(email="waiter@example.com")
        self.assertEqual(entry.status, Waitlist.Status.WAITING)

    def test_duplicate_email_while_waiting_does_not_create_second_row(self):
        Waitlist.objects.create(email="waiter@example.com")
        res = self.client.post(
            "/api/v1/waitlist_join/", {"email": "waiter@example.com"}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(Waitlist.objects.filter(email="waiter@example.com").count(), 1)

    def test_email_normalized_to_lowercase(self):
        res = self.client.post(
            "/api/v1/waitlist_join/", {"email": "Waiter@Example.com"}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(Waitlist.objects.filter(email="waiter@example.com").exists())

    def test_rate_limit_triggers_on_eleventh_request(self):
        for i in range(10):
            res = self.client.post(
                "/api/v1/waitlist_join/", {"email": f"waiter{i}@example.com"}
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
        res = self.client.post(
            "/api/v1/waitlist_join/", {"email": "waiter11@example.com"}
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class SignupIgnoresCapTest(APITestCase):
    def test_signup_succeeds_even_when_cap_already_exceeded(self):
        from users.models import InviteCode

        GameSettings.objects.all().delete()
        settings_obj = GameSettings.current()
        User.objects.create_user(
            email="existing@example.com", password="testpassword123"
        )
        settings_obj.registration_cap = 0
        settings_obj.save()
        InviteCode.objects.create(code="TESTCODE")

        with patch("api.serializers._verify_turnstile", return_value=True):
            res = self.client.post(
                "/api/v1/auth/registration/",
                {
                    "email": "newuser@example.com",
                    "password1": "SuperSecret123!",
                    "password2": "SuperSecret123!",
                    "invite_code": "TESTCODE",
                    "agree_to_terms": True,
                    "turnstile_token": "test-token",
                },
            )
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertTrue(User.objects.filter(email="newuser@example.com").exists())


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class WaitlistServiceEmailTest(TestCase):
    def setUp(self):
        self.entry = Waitlist.objects.create(email="waiter@example.com")

    def test_invite_entry_sends_email_and_sets_fields(self):
        waitlist_service.invite_entry(self.entry)

        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, Waitlist.Status.INVITED)
        self.assertIsNotNone(self.entry.invite_token)
        self.assertIsNotNone(self.entry.invited_at)

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["waiter@example.com"])
        self.assertIn(self.entry.invite_token, mail.outbox[0].body)

    def test_invite_entry_preserves_existing_token(self):
        self.entry.invite_token = "existing-token"
        self.entry.status = Waitlist.Status.INVITED
        self.entry.save()

        waitlist_service.invite_entry(self.entry)

        self.entry.refresh_from_db()
        self.assertEqual(self.entry.invite_token, "existing-token")
        self.assertEqual(len(mail.outbox), 1)

    def test_resend_invite_email_does_not_change_token_or_timestamp(self):
        waitlist_service.invite_entry(self.entry)
        mail.outbox.clear()
        original_token = self.entry.invite_token
        original_invited_at = self.entry.invited_at

        waitlist_service.resend_invite_email(self.entry)

        self.entry.refresh_from_db()
        self.assertEqual(self.entry.invite_token, original_token)
        self.assertEqual(self.entry.invited_at, original_invited_at)
        self.assertEqual(len(mail.outbox), 1)


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class WaitlistAdminActionsTest(TestCase):
    def setUp(self):
        from django.contrib.admin.sites import AdminSite
        from django.contrib.messages.storage.fallback import FallbackStorage
        from django.test import RequestFactory
        from users.admin import WaitlistAdmin

        self.admin = WaitlistAdmin(Waitlist, AdminSite())
        request = RequestFactory().post("/admin/")
        request.session = {}
        request._messages = FallbackStorage(request)
        self.factory_request = request

    def test_invite_selected_now_only_affects_waiting_entries(self):
        waiting1 = Waitlist.objects.create(email="w1@example.com")
        waiting2 = Waitlist.objects.create(email="w2@example.com")
        already_invited = Waitlist.objects.create(
            email="i1@example.com", status=Waitlist.Status.INVITED
        )

        self.admin.invite_selected_now(
            self.factory_request,
            Waitlist.objects.filter(
                pk__in=[waiting1.pk, waiting2.pk, already_invited.pk]
            ),
        )

        waiting1.refresh_from_db()
        waiting2.refresh_from_db()
        already_invited.refresh_from_db()
        self.assertEqual(waiting1.status, Waitlist.Status.INVITED)
        self.assertEqual(waiting2.status, Waitlist.Status.INVITED)
        self.assertEqual(already_invited.status, Waitlist.Status.INVITED)
        self.assertEqual(len(mail.outbox), 2)

    def test_resend_invite_email_action_only_affects_invited_entries(self):
        invited = Waitlist.objects.create(
            email="i1@example.com",
            status=Waitlist.Status.INVITED,
            invite_token="tok",
        )
        waiting = Waitlist.objects.create(email="w1@example.com")

        self.admin.resend_invite_email_action(
            self.factory_request,
            Waitlist.objects.filter(pk__in=[invited.pk, waiting.pk]),
        )

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["i1@example.com"])

    def test_mark_as_removed_sets_status_regardless_of_prior_status(self):
        entry = Waitlist.objects.create(email="w1@example.com")
        self.admin.mark_as_removed(
            self.factory_request, Waitlist.objects.filter(pk=entry.pk)
        )
        entry.refresh_from_db()
        self.assertEqual(entry.status, Waitlist.Status.REMOVED)

    def test_export_selected_to_csv(self):
        entry = Waitlist.objects.create(email="w1@example.com")
        response = self.admin.export_selected_to_csv(
            self.factory_request, Waitlist.objects.filter(pk=entry.pk)
        )
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn(b"w1@example.com", response.content)


class WaitlistModelConstraintTest(TestCase):
    def test_duplicate_active_email_raises_integrity_error(self):
        Waitlist.objects.create(email="dup@example.com", status=Waitlist.Status.WAITING)
        with self.assertRaises(IntegrityError):
            Waitlist.objects.create(
                email="dup@example.com", status=Waitlist.Status.INVITED
            )

    def test_removed_entry_does_not_block_new_waiting_entry(self):
        Waitlist.objects.create(email="dup@example.com", status=Waitlist.Status.REMOVED)
        Waitlist.objects.create(email="dup@example.com", status=Waitlist.Status.WAITING)
        self.assertEqual(Waitlist.objects.filter(email="dup@example.com").count(), 2)
