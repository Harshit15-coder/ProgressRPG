import logging

import stripe
from django.conf import settings
from django.db import transaction

from payments.models import UserSubscription

logger = logging.getLogger("general")
stripe.api_key = settings.STRIPE_SECRET_KEY


@transaction.atomic
def end_active_subscription(user):
    """Cancel a user's active Stripe subscription and deactivate it locally."""
    active_sub = UserSubscription.active_for_user(user)
    if active_sub is None:
        logger.info(
            "[PAYMENTS.SERVICES] No active subscription to cancel for user_id=%s",
            user.id,
        )
        return None

    if active_sub.stripe_subscription_id:
        stripe.Subscription.cancel(active_sub.stripe_subscription_id)
        logger.info(
            "[PAYMENTS.SERVICES] Cancelled Stripe subscription %s for user_id=%s",
            active_sub.stripe_subscription_id,
            user.id,
        )

    active_sub.deactivate()
    logger.info(
        "[PAYMENTS.SERVICES] Deactivated subscription id=%s for user_id=%s",
        active_sub.id,
        user.id,
    )
    return active_sub
