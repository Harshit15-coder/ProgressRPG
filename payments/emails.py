from django.conf import settings
from django.utils import timezone

from users.utils import send_email_to_users


def _account_url():
    return f"{settings.FRONTEND_URL}/account"


def _upgrade_url():
    return f"{settings.FRONTEND_URL}/upgrade"


def send_trial_ending_soon_email(user, trial_end):
    context = {
        "email": user.email,
        "trial_end": trial_end,
        "account_url": _account_url(),
        "current_year": timezone.now().year,
    }
    send_email_to_users(
        users=[user],
        subject="Your Progress RPG trial is ending soon",
        template_base="emails/trial_ending_soon",
        context=context,
    )


def send_trial_ended_email(user):
    context = {
        "email": user.email,
        "upgrade_url": _upgrade_url(),
        "current_year": timezone.now().year,
    }
    send_email_to_users(
        users=[user],
        subject="Your Progress RPG trial has ended",
        template_base="emails/trial_ended",
        context=context,
    )


def send_trial_converted_email(user, subscription):
    context = {
        "email": user.email,
        "plan_name": subscription.plan.name if subscription.plan else "Premium",
        "account_url": _account_url(),
        "current_year": timezone.now().year,
    }
    send_email_to_users(
        users=[user],
        subject="Welcome to Progress RPG Premium!",
        template_base="emails/trial_converted",
        context=context,
    )
