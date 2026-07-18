from django.core.management import BaseCommand, call_command


class Command(BaseCommand):
    help = "Run the full world setup pipeline, keeping existing characters."

    def handle(self, *args, **options):
        self.stdout.write("=== Spawning villages ===")
        call_command("spawn_villages")

        self.stdout.write("=== Generating fields ===")
        # Must run before generate_paths, which needs the field shelter's
        # entrance node to exist.
        call_command("generate_fields")

        self.stdout.write("=== Generating points ===")
        call_command("generate_points")

        self.stdout.write("=== Generating paths ===")
        # Must run before populate_interiors: generate_paths deletes all
        # Path rows for the centre before rebuilding the street network, so
        # running it after populate_interiors would wipe out the
        # entrance<->interior connections that command creates.
        call_command("generate_paths")

        self.stdout.write("=== Populating interiors ===")
        call_command("populate_interiors")

        self.stdout.write("=== Placing characters ===")
        call_command("place_characters")

        self.stdout.write("=== Assigning workers ===")
        call_command("assign_workers")

        self.stdout.write("=== Generating land areas ===")
        call_command("generate_landarea")

        self.stdout.write(self.style.SUCCESS("All setup tasks completed!"))
