from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

from progression.models import Note, Task


class NoteModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="note-model@example.com",
            password="pass",
        )
        self.player = self.user.player

    def test_str_uses_title(self):
        note = Note.objects.create(player=self.player, title="Groceries", body="Milk")

        self.assertEqual(str(note), "Groceries")

    def test_str_falls_back_when_title_blank(self):
        self.player.name = "Test Player"
        self.player.save(update_fields=["name"])
        note = Note.objects.create(player=self.player, title="", body="")

        self.assertIn(self.player.name, str(note))

    def test_deleting_linked_task_nulls_task_but_keeps_note(self):
        task = Task.objects.create(player=self.player, name="Ship it")
        note = Note.objects.create(player=self.player, title="Plan", task=task)

        task.delete()
        note.refresh_from_db()

        self.assertIsNone(note.task)

    def test_task_unique_constraint_rejects_second_note_at_db_level(self):
        task = Task.objects.create(player=self.player, name="Ship it")
        Note.objects.create(player=self.player, title="First", task=task)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Note.objects.create(player=self.player, title="Second", task=task)
