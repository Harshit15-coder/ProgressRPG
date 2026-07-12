from django.core.management import BaseCommand, call_command


class Command(BaseCommand):
    help = (
        "Seed a single small village for the visual-only village view. "
        "Skips populate_interiors/generate_paths/generate_landarea since "
        "none of that is used by the decorative view."
    )

    def handle(self, *args, **options):
        self.stdout.write("=== Spawning village ===")
        call_command("spawn_villages", num_centres=1)

        self.stdout.write("=== Placing characters ===")
        call_command("place_characters")

        self.stdout.write(self.style.SUCCESS("Village view seed data ready!"))
