from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.db import IntegrityError
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from api.serializers import CustomRegisterSerializer
from core.models import GameSettings
from users.models import InviteCode, Waitlist
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

        # `username` is required=True on the inherited RegisterSerializer field
        # despite the project having no username field (ACCOUNT_USER_MODEL_USERNAME_FIELD
        # is None, so max_length=0) — an unrelated allauth/dj-rest-auth version quirk.
        # Patch it out here so this test can exercise the real registration endpoint.
        username_field = CustomRegisterSerializer._declared_fields["username"]
        with patch("api.serializers._verify_turnstile", return_value=True):
            with patch.dict(username_field._kwargs, {"required": False}):
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
        with self.captureOnCommitCallbacks(execute=True):
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

        with self.captureOnCommitCallbacks(execute=True):
            waitlist_service.invite_entry(self.entry)

        self.entry.refresh_from_db()
        self.assertEqual(self.entry.invite_token, "existing-token")
        self.assertEqual(len(mail.outbox), 1)

    def test_resend_invite_email_does_not_change_token_or_timestamp(self):
        with self.captureOnCommitCallbacks(execute=True):
            waitlist_service.invite_entry(self.entry)
        mail.outbox.clear()
        original_token = self.entry.invite_token
        original_invited_at = self.entry.invited_at

        with self.captureOnCommitCallbacks(execute=True):
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

        with self.captureOnCommitCallbacks(execute=True):
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

        with self.captureOnCommitCallbacks(execute=True):
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


@override_settings(
    CELERY_TASK_ALWAYS_EAGER=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class WaitlistInviteTaskTest(TestCase):
    def setUp(self):
        GameSettings.objects.all().delete()
        self.settings = GameSettings.current()

    def _create_waiting(self, n, prefix="w"):
        return [
            Waitlist.objects.create(email=f"{prefix}{i}@example.com") for i in range(n)
        ]

    def test_headroom_greater_than_queue_invites_everyone(self):
        entries = self._create_waiting(3)
        self.settings.registration_cap = 100
        self.settings.save()

        count = waitlist_service.invite_up_to_headroom()

        self.assertEqual(count, 3)
        for entry in entries:
            entry.refresh_from_db()
            self.assertEqual(entry.status, Waitlist.Status.INVITED)

    def test_headroom_less_than_queue_invites_oldest_n(self):
        entries = self._create_waiting(5)
        self.settings.registration_cap = User.objects.count() + 2
        self.settings.save()

        count = waitlist_service.invite_up_to_headroom()

        self.assertEqual(count, 2)
        invited = [
            e
            for e in entries
            if Waitlist.objects.get(pk=e.pk).status == Waitlist.Status.INVITED
        ]
        self.assertEqual({e.pk for e in invited}, {entries[0].pk, entries[1].pk})

    def test_headroom_zero_or_negative_invites_nobody(self):
        self._create_waiting(2)
        self.settings.registration_cap = 0
        self.settings.save()

        count = waitlist_service.invite_up_to_headroom()

        self.assertEqual(count, 0)
        self.assertFalse(
            Waitlist.objects.filter(status=Waitlist.Status.INVITED).exists()
        )

    def test_non_waiting_entries_are_never_touched(self):
        invited = Waitlist.objects.create(
            email="already-invited@example.com",
            status=Waitlist.Status.INVITED,
            invite_token="tok",
        )
        redeemed = Waitlist.objects.create(
            email="redeemed@example.com", status=Waitlist.Status.REDEEMED
        )
        removed = Waitlist.objects.create(
            email="removed@example.com", status=Waitlist.Status.REMOVED
        )
        self.settings.registration_cap = 100
        self.settings.save()

        waitlist_service.invite_up_to_headroom()

        invited.refresh_from_db()
        redeemed.refresh_from_db()
        removed.refresh_from_db()
        self.assertEqual(invited.invite_token, "tok")
        self.assertEqual(redeemed.status, Waitlist.Status.REDEEMED)
        self.assertEqual(removed.status, Waitlist.Status.REMOVED)

    def test_calling_twice_back_to_back_second_run_invites_zero(self):
        self._create_waiting(2)
        self.settings.registration_cap = User.objects.count() + 2
        self.settings.save()

        first = waitlist_service.invite_up_to_headroom()
        second = waitlist_service.invite_up_to_headroom()

        self.assertEqual(first, 2)
        self.assertEqual(second, 0)


class WaitlistRegistrationRedemptionTest(APITestCase):
    def setUp(self):
        GameSettings.objects.all().delete()
        GameSettings.current()

    def _register_payload(self, email, invite_token):
        return {
            "email": email,
            "password1": "SuperSecret123!",
            "password2": "SuperSecret123!",
            "invite_token": invite_token,
            "agree_to_terms": True,
            "turnstile_token": "test-token",
        }

    def _post_register(self, payload):
        username_field = CustomRegisterSerializer._declared_fields["username"]
        with patch("api.serializers._verify_turnstile", return_value=True):
            with patch.dict(username_field._kwargs, {"required": False}):
                return self.client.post("/api/v1/auth/registration/", payload)

    def test_valid_token_and_matching_email_succeeds_and_redeems(self):
        entry = Waitlist.objects.create(
            email="invitee@example.com",
            status=Waitlist.Status.INVITED,
            invite_token="tok-valid",
        )
        res = self._post_register(
            self._register_payload("invitee@example.com", "tok-valid")
        )
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        self.assertTrue(User.objects.filter(email="invitee@example.com").exists())
        entry.refresh_from_db()
        self.assertEqual(entry.status, Waitlist.Status.REDEEMED)

    def test_valid_token_mismatched_email_rejected(self):
        entry = Waitlist.objects.create(
            email="invitee@example.com",
            status=Waitlist.Status.INVITED,
            invite_token="tok-mismatch",
        )
        res = self._post_register(
            self._register_payload("someone-else@example.com", "tok-mismatch")
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        entry.refresh_from_db()
        self.assertEqual(entry.status, Waitlist.Status.INVITED)
        self.assertFalse(User.objects.filter(email="someone-else@example.com").exists())

    def test_already_redeemed_token_rejected(self):
        Waitlist.objects.create(
            email="invitee@example.com",
            status=Waitlist.Status.REDEEMED,
            invite_token="tok-used",
        )
        res = self._post_register(
            self._register_payload("invitee@example.com", "tok-used")
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="invitee@example.com").exists())

    def test_both_invite_code_and_invite_token_rejected(self):
        Waitlist.objects.create(
            email="invitee@example.com",
            status=Waitlist.Status.INVITED,
            invite_token="tok-both",
        )
        InviteCode.objects.create(code="SOMECODE")
        payload = self._register_payload("invitee@example.com", "tok-both")
        payload["invite_code"] = "SOMECODE"
        res = self._post_register(payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="invitee@example.com").exists())

    def test_neither_invite_code_nor_invite_token_rejected(self):
        payload = self._register_payload("invitee@example.com", "")
        del payload["invite_token"]
        res = self._post_register(payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="invitee@example.com").exists())

    def test_concurrent_redemption_race_leaves_no_orphaned_user(self):
        Waitlist.objects.create(
            email="invitee@example.com",
            status=Waitlist.Status.INVITED,
            invite_token="tok-race",
        )

        # Simulate another request winning the race: the conditional UPDATE
        # in custom_signup() matches zero rows, as if a concurrent request
        # already flipped this entry to REDEEMED first.
        mock_queryset = MagicMock()
        mock_queryset.update.return_value = 0
        with patch(
            "api.serializers.Waitlist.objects.filter", return_value=mock_queryset
        ):
            res = self._post_register(
                self._register_payload("invitee@example.com", "tok-race")
            )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="invitee@example.com").exists())


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
