import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from users.models import TutorialStep
from users.services.registration_services import ensure_player_setup_for_user


DEFAULT_PLAYWRIGHT_EMAIL = "playwright@example.com"
DEFAULT_PLAYWRIGHT_PASSWORD = "correcthorsebatterystaple"
DEFAULT_PLAYWRIGHT_PLAYER_NAME = "Playwright Hero"


class Command(BaseCommand):
    help = "Create or reset the dedicated Playwright E2E user."

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            default=os.getenv("PLAYWRIGHT_TEST_EMAIL", DEFAULT_PLAYWRIGHT_EMAIL),
            help="Email for the Playwright test user.",
        )
        parser.add_argument(
            "--password",
            default=os.getenv("PLAYWRIGHT_TEST_PASSWORD", DEFAULT_PLAYWRIGHT_PASSWORD),
            help="Password for the Playwright test user.",
        )
        parser.add_argument(
            "--player-name",
            default=os.getenv(
                "PLAYWRIGHT_TEST_PLAYER_NAME", DEFAULT_PLAYWRIGHT_PLAYER_NAME
            ),
            help="Display name for the Playwright player profile.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        email = options["email"]
        password = options["password"]
        player_name = options["player_name"]

        if not password:
            raise CommandError("A Playwright test password is required.")

        User = get_user_model()
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "is_active": True,
                "is_confirmed": True,
                "timezone": "UTC",
            },
        )

        user_updates = []
        if created or not user.check_password(password):
            user.set_password(password)
            user_updates.append("password")
        if not user.is_active:
            user.is_active = True
            user_updates.append("is_active")
        if not user.is_confirmed:
            user.is_confirmed = True
            user_updates.append("is_confirmed")
        if str(user.timezone) != "UTC":
            user.timezone = "UTC"
            user_updates.append("timezone")

        if user_updates:
            user.save(update_fields=user_updates)

        player = ensure_player_setup_for_user(user)
        player_updates = []
        if player.name != player_name:
            player.name = player_name
            player_updates.append("name")
        if player.onboarding_step != 2:
            player.onboarding_step = 2
            player_updates.append("onboarding_step")
        if not player.onboarding_completed:
            player.onboarding_completed = True
            player_updates.append("onboarding_completed")
        if player.is_deleted:
            player.is_deleted = False
            player_updates.append("is_deleted")
        if player.deleted_at is not None:
            player.deleted_at = None
            player_updates.append("deleted_at")
        if player.bio:
            player.bio = ""
            player_updates.append("bio")
        if player.is_online:
            player.is_online = False
            player_updates.append("is_online")
        if player.active_connections != 0:
            player.active_connections = 0
            player_updates.append("active_connections")
        if player.last_seen is not None:
            player.last_seen = None
            player_updates.append("last_seen")
        if player.xp != 0:
            player.xp = 0
            player_updates.append("xp")
        if player.level != 0:
            player.level = 0
            player_updates.append("level")
        if player.xp_next_level != 100:
            player.xp_next_level = 100
            player_updates.append("xp_next_level")
        if player.xp_modifier != 1:
            player.xp_modifier = 1
            player_updates.append("xp_modifier")

        if player_updates:
            player.save(update_fields=player_updates)

        player.activities.all().delete()
        player.tasks.all().delete()
        player.projects.all().delete()

        activity_timer = player.activity_timer
        activity_timer.reset()

        tutorial_step_ids = list(TutorialStep.objects.values_list("id", flat=True))
        if tutorial_step_ids:
            player.tutorial_steps_seen.set(tutorial_step_ids)

        self.stdout.write(
            self.style.SUCCESS(
                f"Playwright user ready: {user.email} (player={player.name})"
            )
        )
