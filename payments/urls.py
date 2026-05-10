from django.urls import path

from .views import CreateCheckoutSessionView, StripeWebhookView, SyncSubscriptionView

urlpatterns = [
    path("webhook/", StripeWebhookView.as_view(), name="stripe-webhook"),
    path(
        "create-checkout-session/",
        CreateCheckoutSessionView.as_view(),
        name="create-checkout-session",
    ),
    path(
        "sync-subscription/",
        SyncSubscriptionView.as_view(),
        name="sync-subscription",
    ),
]
