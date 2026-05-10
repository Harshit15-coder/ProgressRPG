from payments.models import UserSubscription
from users.models import CustomUser


import logging

logger = logging.getLogger("django")


def extract_price_id(subscription):
    if not subscription:
        return None
    items_obj = getattr(subscription, "items", None)
    if not items_obj:
        return None
    data = getattr(items_obj, "data", None)
    if not data:
        return None
    item = data[0] if data else None
    if not item:
        return None

    price = getattr(item, "price", None)
    if isinstance(price, str):
        return price
    if price:
        return getattr(price, "id", None)

    plan = getattr(item, "plan", None)
    if isinstance(plan, str):
        return plan
    if plan:
        return getattr(plan, "id", None)

    return None


def get_user_from_customer_id(customer_id):
    return CustomUser.objects.filter(stripe_customer_id=customer_id).first()


def resolve_user_from_checkout_session(session_object):
    customer_id = session_object.customer
    user = get_user_from_customer_id(customer_id)
    if user:
        return user

    user_id = session_object.client_reference_id
    if user_id:
        return CustomUser.objects.filter(id=user_id).first()

    return None


def resolve_subscription_payload_and_model(event, event_name):
    stripe_object = event.data.object

    if event_name == "subscription.updated":
        subscription_payload = stripe_object
    elif event_name in {"subscription.deleted", "invoice.payment_failed"}:
        subscription_payload = (
            stripe_object.subscription
            if event_name == "invoice.payment_failed"
            else stripe_object
        )
    else:
        subscription_payload = stripe_object

    if isinstance(subscription_payload, str):
        logger.warning(
            f"[PAYMENTS.WEBHOOK] {event_name} received subscription id string only "
            f"(subscription_id={subscription_payload})"
        )
        return None, subscription_payload, None, None

    if not subscription_payload or isinstance(subscription_payload, str):
        logger.warning(f"[PAYMENTS.WEBHOOK] {event_name} missing subscription payload")
        return None, None, None, None

    subscription_id = subscription_payload.id
    customer_id = subscription_payload.customer

    user = get_user_from_customer_id(customer_id)
    if not user:
        logger.warning(
            f"[PAYMENTS.WEBHOOK] {event_name} for unknown "
            f"customer_id={customer_id} subscription_id={subscription_id}"
        )
        return None, subscription_id, subscription_payload, None

    subscription = (
        UserSubscription.objects.filter(
            user=user,
            stripe_subscription_id=subscription_id,
        )
        .select_related("plan")
        .first()
    )

    if not subscription:
        logger.warning(
            f"[PAYMENTS.WEBHOOK] {event_name} for unknown subscription "
            f"(subscription_id={subscription_id}, customer_id={customer_id})"
        )

    return user, subscription_id, subscription_payload, subscription


def resolve_subscription_from_event(event, event_name):
    stripe_object = event.data.object

    subscription_id = stripe_object.id
    customer_id = stripe_object.customer

    user = get_user_from_customer_id(customer_id)

    subscription = (
        UserSubscription.objects.filter(
            user=user,
            stripe_subscription_id=subscription_id,
        )
        .select_related("plan")
        .first()
    )

    if not subscription:
        logger.warning(
            f"[PAYMENTS.WEBHOOK] {event_name} for unknown (subscription_id={subscription_id}, customer_id={customer_id})"
        )
        return None, subscription_id, None

    return user, subscription_id, subscription
