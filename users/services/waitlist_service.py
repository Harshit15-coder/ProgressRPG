import secrets
from django.conf import settings
from django.utils import timezone

from users.models import Waitlist
from users.utils import send_email_to_users


def generate_invite_token() -> str:
    return secrets.token_urlsafe(32)


def build_invite_url(token: str) -> str:
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    return f"{frontend_url}/waitlist/redeem/{token}"


def send_invite_email(entry: Waitlist) -> None:
    """Queues (or re-queues) the invitation email for an already-invited entry."""
    context = {
        "invite_url": build_invite_url(entry.invite_token),
        "current_year": timezone.now().year,
    }
    send_email_to_users(
        users=[entry.email],
        subject="You're invited to Progress RPG",
        template_base="emails/waitlist_invite_message",
        context=context,
        cc_admin=False,
    )


def invite_entry(entry: Waitlist) -> Waitlist:
    """Promotes a waiting entry to invited and sends the invite email. Idempotent token: only generates one if absent."""
    if not entry.invite_token:
        entry.invite_token = generate_invite_token()
    entry.status = Waitlist.Status.INVITED
    entry.invited_at = timezone.now()
    entry.save(update_fields=["invite_token", "status", "invited_at"])
    send_invite_email(entry)
    return entry


def resend_invite_email(entry: Waitlist) -> Waitlist:
    """Resends the existing invitation without touching token, invited_at, or queue position."""
    send_invite_email(entry)
    return entry
