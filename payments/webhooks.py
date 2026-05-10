import logging
import stripe

from django.conf import settings
from django.db import transaction

from .models import SubscriptionPlan, UserSubscription
from .utils import (
    resolve_subscription_payload_and_model,
    resolve_user_from_checkout_session,
    extract_price_id,
)

logger = logging.getLogger("general")
stripe.api_key = settings.STRIPE_SECRET_KEY


def process_stripe_event(event):
    event_type = event.type

    handlers = {
        "checkout.session.completed": handle_checkout_session_completed,
        "customer.subscription.updated": handle_subscription_updated,
        "customer.subscription.deleted": handle_subscription_deleted,
        "invoice.payment_failed": handle_payment_failed,
    }

    handler = handlers.get(event_type)
    if handler:
        handler(event)


@transaction.atomic
def handle_checkout_session_completed(event):
    session = event.data.object
    customer_id = session.customer

    user = resolve_user_from_checkout_session(session)
    subscription_id = session.subscription

    if not user:
        logger.warning(
            f"[PAYMENTS.WEBHOOK] checkout.session.completed for unknown user "
            f"(customer_id={customer_id}, session_id={session.id})"
        )
        return

    if not subscription_id:
        logger.warning(
            "[PAYMENTS.WEBHOOK] checkout.session.completed missing subscription id "
            f"(session_id={session.id})"
        )
        return

    if user.stripe_customer_id != customer_id:
        user.stripe_customer_id = customer_id
        user.save(update_fields=["stripe_customer_id"])

    try:
        retrieved_subscription = stripe.Subscription.retrieve(subscription_id)
        price_id = extract_price_id(retrieved_subscription)
    except Exception:
        logger.exception(
            "[PAYMENTS.WEBHOOK] Failed to retrieve subscription for checkout "
            f"(subscription_id={subscription_id}, event_id={event.id})"
        )
        raise  # Return 500 so Stripe retries the event

    if not price_id:
        logger.error(
            "[PAYMENTS.WEBHOOK] Could not extract price_id from subscription "
            f"(subscription_id={subscription_id}, event_id={event.id})"
        )
        return

    plan = SubscriptionPlan.objects.filter(stripe_price_id=price_id).first()
    if not plan:
        logger.error(
            "[PAYMENTS.WEBHOOK] No matching subscription plan "
            f"for price_id={price_id} in event_id={event.id}"
        )
        return

    UserSubscription.deactivate_all_for_user(user)

    sub = UserSubscription.objects.create(
        user=user,
        plan=plan,
        stripe_subscription_id=subscription_id,
        active=True,
    )
    logger.info(
        "[PAYMENTS.WEBHOOK] Created subscription id=%s for user_id=%s "
        f"plan=%s stripe_subscription_id=%s",
        sub.id,
        user.id,
        plan.name,
        subscription_id,
    )
    return


def handle_subscription_updated(event):
    _, _, subscription_payload, subscription = resolve_subscription_payload_and_model(
        event,
        "subscription.updated",
    )

    if not subscription_payload or not subscription:
        return

    status = subscription_payload.status

    price_id = extract_price_id(subscription_payload)
    if price_id:
        plan = SubscriptionPlan.objects.filter(stripe_price_id=price_id).first()
        if plan and subscription.plan != plan:
            old_plan_name = subscription.plan.name if subscription.plan else None
            subscription.plan = plan
            subscription.save(update_fields=["plan"])
            logger.info(
                "[PAYMENTS.WEBHOOK] Plan updated for stripe_subscription_id=%s "
                "user_id=%s from %s to %s",
                subscription.stripe_subscription_id,
                subscription.user_id,
                old_plan_name,
                plan.name,
            )

    if status in ["active", "trialing"]:
        subscription.activate()
        logger.info(
            "[PAYMENTS.WEBHOOK] Activated stripe_subscription_id=%s user_id=%s status=%s",
            subscription.stripe_subscription_id,
            subscription.user_id,
            status,
        )
    elif status in ["canceled", "incomplete_expired", "unpaid"]:
        subscription.deactivate()
        logger.info(
            "[PAYMENTS.WEBHOOK] Deactivated stripe_subscription_id=%s user_id=%s status=%s",
            subscription.stripe_subscription_id,
            subscription.user_id,
            status,
        )
    elif status == "past_due":
        logger.warning(
            "[PAYMENTS.WEBHOOK] Past due stripe_subscription_id=%s user_id=%s — no action taken",
            subscription.stripe_subscription_id,
            subscription.user_id,
        )
    else:
        logger.warning(
            "[PAYMENTS.WEBHOOK] Unhandled subscription status=%s "
            "stripe_subscription_id=%s user_id=%s",
            status,
            subscription.stripe_subscription_id,
            subscription.user_id,
        )

    return


def handle_subscription_deleted(event):
    _, _, _, subscription = resolve_subscription_payload_and_model(
        event, "subscription.deleted"
    )

    if not subscription:
        return

    subscription.deactivate()
    logger.info(
        "[PAYMENTS.WEBHOOK] Deactivated (deleted) stripe_subscription_id=%s user_id=%s",
        subscription.stripe_subscription_id,
        subscription.user_id,
    )


def handle_payment_failed(event):
    _, _, _, subscription = resolve_subscription_payload_and_model(
        event, "invoice.payment_failed"
    )

    if not subscription:
        return

    logger.warning(
        "[PAYMENTS.WEBHOOK] Payment failed for stripe_subscription_id=%s user_id=%s",
        subscription.stripe_subscription_id,
        subscription.user_id,
    )
