import logging

import stripe
from django.conf import settings
from django.db import transaction

from payments.models import SubscriptionPlan, UserSubscription
from payments.utils import extract_price_id

logger = logging.getLogger("general")
stripe.api_key = settings.STRIPE_SECRET_KEY

ACTIVE_STATUSES = {"active", "trialing"}
DEAD_STATUSES = {"canceled", "incomplete_expired", "unpaid"}


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


def _fetch_stripe_subscriptions(user):
    """
    Fetch subscriptions from Stripe for a user. Returns a list of Stripe subscription
    objects and also fixes stripe_customer_id on the user if it was missing or stale.

    Resolution order:
    1. List by stored customer ID
    2. If customer ID missing or stale, retrieve by local subscription ID and fix customer ID
    """
    customer_id = getattr(user, "stripe_customer_id", None)

    if customer_id:
        try:
            result = stripe.Subscription.list(
                customer=customer_id,
                status="all",
                limit=10,
                expand=["data.items.data.price"],
            )
            return list(getattr(result, "data", []))
        except stripe.error.InvalidRequestError as exc:
            if exc.code != "resource_missing" or exc.param != "customer":
                raise
            logger.warning(
                "[PAYMENTS.SYNC] Stored customer_id=%s not found in Stripe for user_id=%s "
                "— falling back to local subscription lookup",
                customer_id,
                user.id,
            )
            # Fall through to subscription-ID lookup below

    # No customer ID, or stale one — try local subscription ID first
    local_sub = UserSubscription.active_for_user(user)
    if local_sub and local_sub.stripe_subscription_id:
        logger.info(
            "[PAYMENTS.SYNC] Retrieving subscription for user_id=%s via subscription_id=%s",
            user.id,
            local_sub.stripe_subscription_id,
        )
        try:
            stripe_sub = stripe.Subscription.retrieve(
                local_sub.stripe_subscription_id,
                expand=["items.data.price"],
            )
            real_customer_id = getattr(stripe_sub, "customer", None)
            if real_customer_id and real_customer_id != customer_id:
                user.stripe_customer_id = real_customer_id
                user.save(update_fields=["stripe_customer_id"])
            return [stripe_sub]
        except stripe.error.InvalidRequestError as exc:
            if exc.code != "resource_missing":
                raise
            logger.warning(
                "[PAYMENTS.SYNC] Local subscription_id=%s not found in Stripe for user_id=%s "
                "— falling back to email lookup",
                local_sub.stripe_subscription_id,
                user.id,
            )

    # Last resort: search Stripe for a customer by email
    email = getattr(user, "email", None)
    if not email:
        logger.info(
            "[PAYMENTS.SYNC] No stripe_customer_id, no local subscription, and no email "
            "for user_id=%s — nothing to sync",
            user.id,
        )
        return []

    logger.info(
        "[PAYMENTS.SYNC] Searching Stripe for customer by email=%s for user_id=%s",
        email,
        user.id,
    )
    customers = stripe.Customer.search(query=f'email:"{email}"', limit=5)
    customer_data = list(getattr(customers, "data", []))
    if not customer_data:
        logger.info(
            "[PAYMENTS.SYNC] No Stripe customer found for email=%s user_id=%s",
            email,
            user.id,
        )
        return []

    # Use the most recently created customer
    stripe_customer = sorted(customer_data, key=lambda c: c.created, reverse=True)[0]
    real_customer_id = stripe_customer.id
    logger.info(
        "[PAYMENTS.SYNC] Found Stripe customer_id=%s for email=%s user_id=%s",
        real_customer_id,
        email,
        user.id,
    )
    user.stripe_customer_id = real_customer_id
    user.save(update_fields=["stripe_customer_id"])

    result = stripe.Subscription.list(
        customer=real_customer_id,
        status="all",
        limit=10,
        expand=["data.items.data.price"],
    )
    return list(getattr(result, "data", []))


def _reconcile_subscriptions(user, subscriptions_data):
    """Apply a list of Stripe subscription objects to local state."""
    live = [s for s in subscriptions_data if s.status in ACTIVE_STATUSES]
    candidate = (
        live[0] if live else (subscriptions_data[0] if subscriptions_data else None)
    )

    if not candidate:
        UserSubscription.deactivate_all_for_user(user)
        logger.info(
            "[PAYMENTS.SYNC] No Stripe subscriptions for user_id=%s — deactivated all local",
            user.id,
        )
        return {"status": "none", "synced": True}

    stripe_sub_id = candidate.id
    stripe_status = candidate.status
    price_id = extract_price_id(candidate)
    plan = (
        SubscriptionPlan.objects.filter(stripe_price_id=price_id).first()
        if price_id
        else None
    )

    if stripe_status in ACTIVE_STATUSES:
        local_sub = UserSubscription.objects.filter(
            stripe_subscription_id=stripe_sub_id
        ).first()
        if not local_sub:
            UserSubscription.deactivate_all_for_user(user)
            local_sub = UserSubscription.objects.create(
                user=user,
                plan=plan,
                stripe_subscription_id=stripe_sub_id,
                active=True,
            )
            logger.info(
                "[PAYMENTS.SYNC] Created missing local subscription id=%s for user_id=%s "
                "stripe_subscription_id=%s status=%s",
                local_sub.id,
                user.id,
                stripe_sub_id,
                stripe_status,
            )
        else:
            if plan and local_sub.plan != plan:
                local_sub.plan = plan
                local_sub.save(update_fields=["plan"])
            if not local_sub.active:
                local_sub.activate()
                logger.info(
                    "[PAYMENTS.SYNC] Reactivated local subscription id=%s for user_id=%s",
                    local_sub.id,
                    user.id,
                )
        return {"status": stripe_status, "synced": True}

    if stripe_status in DEAD_STATUSES:
        local_sub = UserSubscription.objects.filter(
            stripe_subscription_id=stripe_sub_id, active=True
        ).first()
        if local_sub:
            local_sub.deactivate()
            logger.info(
                "[PAYMENTS.SYNC] Deactivated local subscription id=%s for user_id=%s "
                "stripe_status=%s",
                local_sub.id,
                user.id,
                stripe_status,
            )
        return {"status": stripe_status, "synced": True}

    return {"status": stripe_status, "synced": False}


@transaction.atomic
def sync_subscription_from_stripe(user):
    """
    Fetch the user's current subscription(s) from Stripe and reconcile local state.
    Returns a dict: {"status": "active"|"trialing"|"none", "synced": bool}.
    """
    subscriptions_data = _fetch_stripe_subscriptions(user)
    return _reconcile_subscriptions(user, subscriptions_data)
