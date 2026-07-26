from django.db import migrations, models
import django.db.models.deletion


def backfill_home_locations(apps, schema_editor):
    Character = apps.get_model("character", "Character")
    CharacterLocation = apps.get_model("character", "CharacterLocation")

    CharacterLocation.objects.bulk_create(
        [
            CharacterLocation(
                character_id=character_id,
                location_id=building_id,
                role="home",
                is_primary=True,
            )
            for character_id, building_id in Character.objects.filter(
                building__isnull=False
            ).values_list("id", "building_id")
        ]
    )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("character", "0009_charactercurrency_currency_fk"),
        ("locations", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="CharacterLocation",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "role",
                    models.CharField(
                        choices=[("home", "Home"), ("work", "Work")], max_length=10
                    ),
                ),
                ("is_primary", models.BooleanField(default=True)),
                (
                    "character",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="locations",
                        to="character.character",
                    ),
                ),
                (
                    "location",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="character_locations",
                        to="locations.building",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="characterlocation",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_primary", True)),
                fields=("character", "role"),
                name="one_primary_location_per_character_role",
            ),
        ),
        migrations.RunPython(backfill_home_locations, noop_reverse),
    ]
