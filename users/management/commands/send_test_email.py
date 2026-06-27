from django.core.management.base import BaseCommand
from django.core.mail import send_mail


class Command(BaseCommand):
    help = "Send a test email to verify the email backend is working"

    def add_arguments(self, parser):
        parser.add_argument(
            "--to",
            default="gaidheal01@gmail.com",
            help="Recipient email address (default: gaidheal01@gmail.com)",
        )

    def handle(self, *args, **options):
        recipient = options["to"]
        send_mail(
            subject="Progress RPG — test email",
            message="If you're reading this, transactional email is working.",
            from_email=None,  # uses DEFAULT_FROM_EMAIL
            recipient_list=[recipient],
            fail_silently=False,
        )
        self.stdout.write(self.style.SUCCESS(f"Test email sent to '{recipient}'."))
