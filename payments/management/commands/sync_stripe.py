import logging

import stripe
from django.core.management.base import BaseCommand, CommandError

from payments.services import run_full_sync

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Sync the local database against the currently-configured Stripe account. "
        "Run this after switching between Stripe sandbox and live keys."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--plans-only",
            action="store_true",
            help="Only sync SubscriptionPlan stripe_price_id / price fields.",
        )
        parser.add_argument(
            "--customers-only",
            action="store_true",
            help="Only sync CustomUser.stripe_customer_id fields.",
        )
        parser.add_argument(
            "--subscriptions-only",
            action="store_true",
            help="Only sync UserSubscription records.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch from Stripe and log what would change; make no DB writes.",
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Print each individual change in addition to the summary.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        verbose = options["verbose"]
        plans_only = options["plans_only"]
        customers_only = options["customers_only"]
        subscriptions_only = options["subscriptions_only"]

        # If no --*-only flag given, run all phases.
        run_all = not (plans_only or customers_only or subscriptions_only)

        run_plans = run_all or plans_only
        run_customers = run_all or customers_only
        run_subscriptions = run_all or subscriptions_only

        if dry_run:
            self.stdout.write(
                self.style.WARNING("DRY RUN — no database changes will be made.\n")
            )

        try:
            summary = run_full_sync(
                plans=run_plans,
                customers=run_customers,
                subscriptions=run_subscriptions,
                dry_run=dry_run,
            )
        except stripe.error.AuthenticationError as exc:
            raise CommandError(
                f"Stripe authentication failed — check STRIPE_SECRET_KEY: {exc}"
            )
        except stripe.error.StripeError as exc:
            raise CommandError(f"Stripe API error: {exc}")

        if "plans" in summary:
            p = summary["plans"]
            self.stdout.write(
                self.style.SUCCESS(
                    f"Plans:         created={p['created']}  updated={p['updated']}  skipped={p['skipped']}"
                )
            )
            if verbose:
                for line in p.get("changes", []):
                    self.stdout.write(line)

        if "customers" in summary:
            c = summary["customers"]
            self.stdout.write(
                self.style.SUCCESS(
                    f"Customers:     updated={c['updated']}  skipped={c['skipped']}"
                )
            )
            if verbose:
                for line in c.get("changes", []):
                    self.stdout.write(line)

        if "subscriptions" in summary:
            s = summary["subscriptions"]
            self.stdout.write(
                self.style.SUCCESS(
                    f"Subscriptions: created={s['created']}  updated={s['updated']}  "
                    f"deactivated={s['deactivated']}  skipped={s['skipped']}"
                )
            )
            if verbose:
                for line in s.get("changes", []):
                    self.stdout.write(line)

        if dry_run:
            self.stdout.write(
                self.style.WARNING("\nDry run complete — no changes written.")
            )
        else:
            self.stdout.write(self.style.SUCCESS("\nSync complete."))
