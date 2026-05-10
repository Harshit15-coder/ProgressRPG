import logging

import stripe
from django.conf import settings
from django.db import transaction

from payments.models import SubscriptionPlan, UserSubscription
from payments.utils import extract_price_id

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


@transaction.atomic
def sync_subscription_from_stripe(user):
    """
    Fetch the user's current subscription(s) from Stripe and reconcile local state.
    Returns a dict: {"status": "active"|"trialing"|"none", "synced": bool}.
    """
    customer_id = getattr(user, "stripe_customer_id", None)
    if not customer_id:
        logger.info(
            "[PAYMENTS.SYNC] No stripe_customer_id for user_id=%s — nothing to sync",
            user.id,
        )
        return {"status": "none", "synced": False}

    try:
        subscriptions = stripe.Subscription.list(
            customer=customer_id,
            status="all",
            limit=10,
            expand=["data.items.data.price"],
        )
    except stripe.error.InvalidRequestError as exc:
        if exc.code == "resource_missing" and exc.param == "customer":
            # Stored customer ID is stale (e.g. copied from another Stripe environment).
            # Fall back to looking up the local subscription directly in Stripe.
            logger.warning(
                "[PAYMENTS.SYNC] Stored customer_id=%s not found in Stripe for user_id=%s "
                "— falling back to local subscription lookup",
                customer_id,
                user.id,
            )
            local_sub = UserSubscription.active_for_user(user)
            if not local_sub or not local_sub.stripe_subscription_id:
                return {"status": "none", "synced": False}
            try:
                candidate = stripe.Subscription.retrieve(
                    local_sub.stripe_subscription_id,
                    expand=["items.data.price"],
                )
                # Update the stored customer ID now that we know the real one
                real_customer_id = getattr(candidate, "customer", None)
                if real_customer_id and real_customer_id != customer_id:
                    user.stripe_customer_id = real_customer_id
                    user.save(update_fields=["stripe_customer_id"])
                subscriptions_data = [candidate]
            except stripe.error.StripeError:
                logger.exception(
                    "[PAYMENTS.SYNC] Failed to retrieve subscription %s for user_id=%s",
                    local_sub.stripe_subscription_id,
                    user.id,
                )
                raise
        else:
            logger.exception(
                "[PAYMENTS.SYNC] Failed to list Stripe subscriptions for user_id=%s customer_id=%s",
                user.id,
                customer_id,
            )
            raise
    except stripe.error.StripeError:
        logger.exception(
            "[PAYMENTS.SYNC] Failed to list Stripe subscriptions for user_id=%s customer_id=%s",
            user.id,
            customer_id,
        )
        raise
    else:
        subscriptions_data = getattr(subscriptions, "data", [])

    # Pick the most relevant subscription: active/trialing first, then most recent
    ACTIVE_STATUSES = {"active", "trialing"}
    DEAD_STATUSES = {"canceled", "incomplete_expired", "unpaid"}

    live = [s for s in subscriptions_data if s.status in ACTIVE_STATUSES]
    candidate = (
        live[0] if live else (subscriptions_data[0] if subscriptions_data else None)
    )

    if not candidate:
        UserSubscription.deactivate_all_for_user(user)
        logger.info(
            "[PAYMENTS.SYNC] No Stripe subscriptions found for user_id=%s — deactivated all local",
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
