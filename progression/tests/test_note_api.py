"""API tests for the standalone Notes feature (issue #632)."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from progression.models import Note, Task

User = get_user_model()


class NoteViewSetTests(APITestCase):
    """CRUD, ownership scoping and sanitization on the notes endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(
            email="note-owner@example.com", password="pass"
        )
        self.player = self.user.player
        self.other_user = User.objects.create_user(
            email="note-intruder@example.com", password="pass"
        )
        self.client.force_authenticate(user=self.user)

    def test_create_assigns_requesting_player(self):
        response = self.client.post(
            reverse("notes-list"), {"title": "Groceries", "body": "Milk, eggs"}
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        note = Note.objects.get(pk=response.data["id"])
        self.assertEqual(note.player, self.player)

    def test_list_only_returns_own_notes(self):
        Note.objects.create(player=self.player, title="Mine", body="")
        Note.objects.create(player=self.other_user.player, title="Theirs", body="")

        response = self.client.get(reverse("notes-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [n["title"] for n in response.data["results"]]
        self.assertEqual(titles, ["Mine"])

    def test_cannot_access_another_players_note(self):
        other_note = Note.objects.create(
            player=self.other_user.player, title="Theirs", body=""
        )

        response = self.client.get(reverse("notes-detail", args=[other_note.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_delete_another_players_note(self):
        other_note = Note.objects.create(
            player=self.other_user.player, title="Theirs", body=""
        )

        response = self.client.delete(reverse("notes-detail", args=[other_note.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Note.objects.filter(pk=other_note.id).exists())

    def test_can_link_note_to_own_task(self):
        task = Task.objects.create(player=self.player, name="Ship it")

        response = self.client.post(
            reverse("notes-list"), {"title": "Plan", "body": "", "task": task.id}
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        note = Note.objects.get(pk=response.data["id"])
        self.assertEqual(note.task, task)

    def test_cannot_link_note_to_another_players_task(self):
        other_task = Task.objects.create(player=self.other_user.player, name="Theirs")

        response = self.client.post(
            reverse("notes-list"), {"title": "Plan", "body": "", "task": other_task.id}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_html_tags_are_stripped_before_save(self):
        response = self.client.post(
            reverse("notes-list"),
            {"title": "<b>Bold</b>", "body": "<div>Safe text</div>"},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        note = Note.objects.get(pk=response.data["id"])
        self.assertEqual(note.title, "Bold")
        self.assertEqual(note.body, "Safe text")
        # No HTML tags survive, so nothing can be interpreted as markup on render.
        self.assertNotIn("<", note.title)
        self.assertNotIn("<", note.body)

    def test_update_edits_title_body_and_task_link(self):
        note = Note.objects.create(player=self.player, title="Old", body="Old body")
        task = Task.objects.create(player=self.player, name="Ship it")

        response = self.client.patch(
            reverse("notes-detail", args=[note.id]),
            {"title": "New", "body": "New body", "task": task.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        note.refresh_from_db()
        self.assertEqual(note.title, "New")
        self.assertEqual(note.body, "New body")
        self.assertEqual(note.task, task)

    def test_delete_removes_note(self):
        note = Note.objects.create(player=self.player, title="Gone", body="")

        response = self.client.delete(reverse("notes-detail", args=[note.id]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Note.objects.filter(pk=note.id).exists())

    def test_unauthenticated_request_is_rejected(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(reverse("notes-list"))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
