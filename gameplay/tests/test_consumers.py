from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TransactionTestCase

from character.models import PlayerCharacterLink
from gameplay.consumers import TimerConsumer


class DummyChannelLayer:
    def __init__(self):
        self.groups = set()

    async def group_add(self, group, channel_name):
        self.groups.add(group)

    async def group_discard(self, group, channel_name):
        self.groups.discard(group)


class AsyncCallRecorder:
    def __init__(self, return_value=None):
        self.calls = []
        self.return_value = return_value

    async def __call__(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return self.return_value


class MockTimer:
    def __init__(self, status="empty"):
        self.status = status


class TimerConsumerNoCharacterTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="ws-no-character@example.com",
            password="test-pass-123",
        )
        self.player = self.user.player

        # Ensure this test user has no active player-character link.
        PlayerCharacterLink.objects.filter(player=self.player, is_active=True).update(
            is_active=False
        )

    def test_set_player_and_character_handles_missing_link(self):
        consumer = TimerConsumer()

        player, character, link = async_to_sync(consumer.set_player_and_character)(
            self.user
        )

        self.assertEqual(player, self.player)
        self.assertIsNone(character)
        self.assertIsNone(link)

    def test_connect_accepts_without_active_character(self):
        consumer = TimerConsumer()
        consumer.scope = {"user": self.user}
        consumer.channel_layer = DummyChannelLayer()
        consumer.channel_name = "test.channel.no.character"

        accept_recorder = AsyncCallRecorder()
        close_recorder = AsyncCallRecorder()
        send_json_recorder = AsyncCallRecorder()
        pending_recorder = AsyncCallRecorder()
        timer_recorder = AsyncCallRecorder(return_value=None)

        consumer.accept = accept_recorder
        consumer.close = close_recorder
        consumer.send_json = send_json_recorder
        consumer._send_pending_messages = pending_recorder
        consumer.get_activity_timer = timer_recorder

        async_to_sync(consumer.connect)()

        self.assertEqual(len(accept_recorder.calls), 1)
        self.assertEqual(len(close_recorder.calls), 0)
        self.assertEqual(consumer.player, self.player)
        self.assertIsNone(consumer.character)
        self.assertIsNone(consumer.link)

        sent_payloads = [args[0] for args, _ in send_json_recorder.calls]
        self.assertIn(
            {
                "type": "server_message",
                "action": "no_active_character",
                "message": "Connected without an active character.",
            },
            sent_payloads,
        )


class TimerConsumerAuthTests(TransactionTestCase):
    """
    Tests for connect() when the JWT is missing or expired.
    The middleware sets AnonymousUser on the scope in both cases,
    so the consumer must close without accepting.
    """

    def _make_consumer(self, user):
        consumer = TimerConsumer()
        consumer.scope = {"user": user}
        consumer.channel_layer = DummyChannelLayer()
        consumer.channel_name = "test.channel.auth"
        consumer.accept = AsyncCallRecorder()
        consumer.close = AsyncCallRecorder()
        return consumer

    def test_connect_closes_when_user_is_anonymous(self):
        consumer = self._make_consumer(AnonymousUser())

        async_to_sync(consumer.connect)()

        self.assertEqual(len(consumer.close.calls), 1)
        self.assertEqual(len(consumer.accept.calls), 0)

    def test_connect_closes_when_scope_has_no_user(self):
        consumer = TimerConsumer()
        consumer.scope = {}  # middleware absent / misconfigured
        consumer.channel_layer = DummyChannelLayer()
        consumer.channel_name = "test.channel.no-user"
        consumer.accept = AsyncCallRecorder()
        consumer.close = AsyncCallRecorder()

        async_to_sync(consumer.connect)()

        self.assertEqual(len(consumer.close.calls), 1)
        self.assertEqual(len(consumer.accept.calls), 0)


class TimerConsumerDisconnectTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="ws-disconnect@example.com",
            password="test-pass-123",
        )
        self.player = self.user.player

    def _make_connected_consumer(self):
        consumer = TimerConsumer()
        consumer.scope = {"user": self.user}
        consumer.channel_layer = DummyChannelLayer()
        consumer.channel_name = "test.channel.disconnect"
        consumer.player = self.player
        consumer.player_group = f"player_{self.player.id}"
        consumer.character = None
        consumer.link = None
        consumer.activity_timer = MockTimer(status="empty")
        # Simulate the groups that connect() would have joined.
        async_to_sync(consumer.channel_layer.group_add)(
            consumer.player_group, consumer.channel_name
        )
        async_to_sync(consumer.channel_layer.group_add)(
            "online_users", consumer.channel_name
        )
        return consumer

    def test_disconnect_returns_early_without_player(self):
        """No player means an unauthenticated socket was closed — skip all cleanup."""
        consumer = TimerConsumer()
        consumer.scope = {"user": AnonymousUser()}
        consumer.channel_layer = DummyChannelLayer()
        consumer.channel_name = "test.channel.anon-disconnect"

        async_to_sync(consumer.disconnect)(1000)

        self.assertEqual(len(consumer.channel_layer.groups), 0)

    def test_disconnect_removes_player_from_groups(self):
        consumer = self._make_connected_consumer()

        self.assertIn(consumer.player_group, consumer.channel_layer.groups)
        self.assertIn("online_users", consumer.channel_layer.groups)

        async_to_sync(consumer.disconnect)(1000)

        self.assertNotIn(consumer.player_group, consumer.channel_layer.groups)
        self.assertNotIn("online_users", consumer.channel_layer.groups)

    def test_disconnect_does_not_pause_timers_when_already_paused(self):
        """Timer in a terminal state must not trigger control_timers."""
        consumer = self._make_connected_consumer()
        consumer.activity_timer = MockTimer(status="paused")

        # If control_timers were called it would hit the DB and raise; passing
        # without error is the assertion.
        async_to_sync(consumer.disconnect)(1000)
