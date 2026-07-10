from django.db import migrations, models
from django.utils import timezone


def backfill_cutoff(apps, schema_editor):
    GameSettings = apps.get_model("core", "GameSettings")
    GameSettings.objects.update(waitlist_nudges_enabled_from=timezone.now())


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_gamesettings_registration_cap"),
    ]

    operations = [
        migrations.AddField(
            model_name="gamesettings",
            name="waitlist_nudges_enabled_from",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_cutoff, noop),
    ]
