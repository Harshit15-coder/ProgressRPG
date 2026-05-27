import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_image"),
        ("users", "0009_player_tutorial_steps_seen_tutorialstep_youtube_url"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="tutorialstep",
            name="image",
        ),
        migrations.RemoveField(
            model_name="tutorialstep",
            name="alt_text",
        ),
        migrations.RemoveField(
            model_name="tutorialstep",
            name="created_at",
        ),
        migrations.RemoveField(
            model_name="tutorialstep",
            name="updated_at",
        ),
        migrations.AddField(
            model_name="tutorialstep",
            name="image",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="tutorial_steps",
                to="core.image",
            ),
        ),
    ]
