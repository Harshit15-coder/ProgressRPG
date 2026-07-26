from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("character", "0010_characterlocation"),
    ]

    operations = [
        migrations.CreateModel(
            name="CharacterNeeds",
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
                ("hunger", models.FloatField(default=0)),
                ("last_fed_on", models.DateField(blank=True, null=True)),
                (
                    "character",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="needs",
                        to="character.character",
                    ),
                ),
            ],
        ),
    ]
