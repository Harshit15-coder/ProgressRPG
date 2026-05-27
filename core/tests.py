from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import GameSettings
from users.services.login_services import (
    calculate_daily_login_reward,
    LOGIN_STATE_ALREADY_LOGGED_TODAY,
    LOGIN_STATE_STREAK_CONTINUES,
    LOGIN_STATE_STREAK_RESET,
)

User = get_user_model()


class GameSettingsSingletonTest(TestCase):
    def setUp(self):
        GameSettings.objects.all().delete()

    def test_current_creates_instance_on_first_call(self):
        self.assertEqual(GameSettings.objects.count(), 0)
        settings = GameSettings.current()
        self.assertIsNotNone(settings)
        self.assertEqual(GameSettings.objects.count(), 1)

    def test_current_returns_same_instance(self):
        s1 = GameSettings.current()
        s2 = GameSettings.current()
        self.assertEqual(s1.pk, s2.pk)

    def test_defaults(self):
        s = GameSettings.current()
        self.assertEqual(s.free_timer_limit_seconds, 1800)
        self.assertEqual(s.daily_login_base_xp, 10)
        self.assertEqual(s.daily_login_streak_step_xp, 2)
        self.assertEqual(s.daily_login_max_xp, 20)
        self.assertEqual(s.premium_activity_xp_multiplier, Decimal("2.00"))
        self.assertEqual(s.default_activity_xp_per_second, Decimal("1.0000"))


class GameSettingsValidationTest(TestCase):
    def setUp(self):
        GameSettings.objects.all().delete()
        self.settings = GameSettings.current()

    def test_negative_free_timer_limit_rejected(self):
        self.settings.free_timer_limit_seconds = -1
        with self.assertRaises(ValidationError):
            self.settings.save()

    def test_negative_base_xp_rejected(self):
        self.settings.daily_login_base_xp = -1
        with self.assertRaises(ValidationError):
            self.settings.save()

    def test_max_xp_below_base_xp_rejected(self):
        self.settings.daily_login_base_xp = 15
        self.settings.daily_login_max_xp = 10
        with self.assertRaises(ValidationError):
            self.settings.save()

    def test_zero_multiplier_rejected(self):
        self.settings.premium_activity_xp_multiplier = Decimal("0")
        with self.assertRaises(ValidationError):
            self.settings.save()

    def test_negative_xp_per_second_rejected(self):
        self.settings.default_activity_xp_per_second = Decimal("-0.5")
        with self.assertRaises(ValidationError):
            self.settings.save()

    def test_duplicate_instance_rejected(self):
        with self.assertRaises(ValidationError):
            GameSettings.objects.create()


class LoginRewardFromSettingsTest(TestCase):
    def setUp(self):
        GameSettings.objects.all().delete()
        self.settings = GameSettings.current()

    def test_no_reward_for_already_logged_today(self):
        self.assertEqual(
            calculate_daily_login_reward(LOGIN_STATE_ALREADY_LOGGED_TODAY, streak=5),
            0,
        )

    def test_base_xp_on_streak_reset(self):
        self.settings.daily_login_base_xp = 10
        self.settings.save()
        self.assertEqual(
            calculate_daily_login_reward(LOGIN_STATE_STREAK_RESET, streak=1),
            10,
        )

    def test_streak_bonus_applied(self):
        self.settings.daily_login_base_xp = 10
        self.settings.daily_login_streak_step_xp = 2
        self.settings.daily_login_max_xp = 20
        self.settings.save()
        # streak=3 → bonus = (3-1)*2 = 4 → total = 14
        self.assertEqual(
            calculate_daily_login_reward(LOGIN_STATE_STREAK_CONTINUES, streak=3),
            14,
        )

    def test_streak_reward_capped_at_max(self):
        self.settings.daily_login_base_xp = 10
        self.settings.daily_login_streak_step_xp = 5
        self.settings.daily_login_max_xp = 20
        self.settings.save()
        # streak=100 → would be huge, but capped at 20
        self.assertEqual(
            calculate_daily_login_reward(LOGIN_STATE_STREAK_CONTINUES, streak=100),
            20,
        )

    def test_custom_base_xp_used(self):
        self.settings.daily_login_base_xp = 25
        self.settings.daily_login_max_xp = 50
        self.settings.save()
        self.assertEqual(
            calculate_daily_login_reward(LOGIN_STATE_STREAK_RESET, streak=1),
            25,
        )


class PremiumXpMultiplierFromSettingsTest(TestCase):
    def setUp(self):
        GameSettings.objects.all().delete()
        self.settings = GameSettings.current()
        self.user = User.objects.create_user(email="test@example.com", password="pass")

    def test_free_player_gets_1x(self):
        self.user.is_premium = False
        self.user.save()
        multiplier = self.user.player.get_activity_xp_multiplier()
        self.assertEqual(multiplier, Decimal("1.0"))

    def test_premium_player_uses_configured_multiplier(self):
        self.settings.premium_activity_xp_multiplier = Decimal("3.00")
        self.settings.save()
        self.user.is_premium = True
        self.user.save()
        multiplier = self.user.player.get_activity_xp_multiplier()
        self.assertEqual(multiplier, Decimal("3.00"))

    def test_premium_player_uses_default_multiplier(self):
        self.user.is_premium = True
        self.user.save()
        multiplier = self.user.player.get_activity_xp_multiplier()
        self.assertEqual(multiplier, Decimal("2.00"))


class GameSettingsAPITest(APITestCase):
    def setUp(self):
        GameSettings.objects.all().delete()
        GameSettings.current()
        self.user = User.objects.create_user(email="api@example.com", password="pass")
        self.client.force_authenticate(user=self.user)

    def test_game_settings_endpoint_returns_all_fields(self):
        res = self.client.get("/api/v1/game_settings/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn("free_timer_limit_seconds", data)
        self.assertIn("daily_login_base_xp", data)
        self.assertIn("daily_login_streak_step_xp", data)
        self.assertIn("daily_login_max_xp", data)
        self.assertIn("premium_activity_xp_multiplier", data)
        self.assertIn("default_activity_xp_per_second", data)

    def test_game_settings_requires_auth(self):
        self.client.force_authenticate(user=None)
        res = self.client.get("/api/v1/game_settings/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
