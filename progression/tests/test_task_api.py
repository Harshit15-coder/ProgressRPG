"""API and XP tests for the tasks core loop (issue #467).

Covers:
- ``PlayerActivity.get_xp_reward_summary`` applying the task XP multiplier
- The task list/detail endpoints (ownership scoping, create, filtering)
- The first-completion bonus awarded by ``TaskViewSet.partial_update``
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import GameSettings
from progression.models import PlayerActivity, Task

User = get_user_model()


class TaskXpMultiplierTests(APITestCase):
    """``get_xp_reward_summary`` applies the task multiplier only when linked."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="task-xp@example.com", password="pass"
        )
        self.player = self.user.player
        self.task = Task.objects.create(player=self.player, name="Write docs")
        # Pin the relevant GameSettings so the expected numbers are explicit.
        settings = GameSettings.current()
        settings.default_activity_xp_per_second = "1.0000"
        settings.task_activity_xp_multiplier = "1.25"
        settings.save(
            update_fields=[
                "default_activity_xp_per_second",
                "task_activity_xp_multiplier",
            ]
        )

    def test_task_linked_activity_applies_multiplier(self):
        activity = PlayerActivity.objects.create(
            player=self.player, name="Task work", duration=100, task=self.task
        )

        summary = activity.get_xp_reward_summary()

        self.assertEqual(summary["base_xp"], 100)
        self.assertEqual(summary["task_xp_multiplier"], 1.25)
        self.assertEqual(summary["xp_multiplier"], 1.25)
        self.assertEqual(summary["xp_gained"], 125)

    def test_unlinked_activity_does_not_apply_multiplier(self):
        activity = PlayerActivity.objects.create(
            player=self.player, name="Loose work", duration=100
        )

        summary = activity.get_xp_reward_summary()

        # Whole-number multipliers are formatted as ints (see ``_fmt``).
        self.assertEqual(summary["task_xp_multiplier"], 1)
        self.assertEqual(summary["xp_multiplier"], 1)
        self.assertEqual(summary["xp_gained"], 100)


class TaskViewSetTests(APITestCase):
    """CRUD, ownership scoping and filtering on the tasks endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="task-owner@example.com", password="pass"
        )
        self.player = self.user.player
        self.other_user = User.objects.create_user(
            email="task-intruder@example.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)

    def test_create_assigns_requesting_player(self):
        response = self.client.post(reverse("tasks-list"), {"name": "New task"})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        task = Task.objects.get(pk=response.data["id"])
        self.assertEqual(task.player, self.player)

    def test_list_only_returns_own_tasks(self):
        Task.objects.create(player=self.player, name="Mine")
        Task.objects.create(player=self.other_user.player, name="Theirs")

        response = self.client.get(reverse("tasks-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [t["name"] for t in response.data["results"]]
        self.assertEqual(names, ["Mine"])

    def test_cannot_access_another_players_task(self):
        other_task = Task.objects.create(player=self.other_user.player, name="Theirs")

        response = self.client.get(reverse("tasks-detail", args=[other_task.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_filter_by_completion_state(self):
        Task.objects.create(player=self.player, name="Done", is_complete=True)
        Task.objects.create(player=self.player, name="Todo", is_complete=False)

        response = self.client.get(reverse("tasks-list"), {"is_complete": "true"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [t["name"] for t in response.data["results"]]
        self.assertEqual(names, ["Done"])


class TaskCompletionBonusTests(APITestCase):
    """First mark-complete awards the bonus exactly once (issue #432)."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="task-bonus@example.com", password="pass"
        )
        self.player = self.user.player
        self.task = Task.objects.create(player=self.player, name="Ship it")
        self.client.force_authenticate(user=self.user)

        settings = GameSettings.current()
        settings.task_completion_xp = 100
        settings.save(update_fields=["task_completion_xp"])

    def _patch(self, **data):
        return self.client.patch(reverse("tasks-detail", args=[self.task.id]), data)

    def test_first_completion_awards_bonus(self):
        response = self._patch(is_complete=True)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["completion_xp_gained"], 100)
        self.assertIn("level_ups", response.data)

        self.task.refresh_from_db()
        self.assertTrue(self.task.is_complete)
        self.assertIsNotNone(self.task.first_completed_at)

    def test_recompletion_after_undo_awards_no_bonus(self):
        self._patch(is_complete=True)
        first_completed_at = Task.objects.get(pk=self.task.pk).first_completed_at

        undo = self._patch(is_complete=False)
        self.assertEqual(undo.data["completion_xp_gained"], 0)

        recomplete = self._patch(is_complete=True)
        self.assertEqual(recomplete.data["completion_xp_gained"], 0)

        # The original first-completion timestamp is preserved.
        self.task.refresh_from_db()
        self.assertEqual(self.task.first_completed_at, first_completed_at)

    def test_non_completion_update_awards_no_bonus(self):
        response = self._patch(name="Renamed")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["completion_xp_gained"], 0)

        self.task.refresh_from_db()
        self.assertEqual(self.task.name, "Renamed")
        self.assertIsNone(self.task.first_completed_at)
