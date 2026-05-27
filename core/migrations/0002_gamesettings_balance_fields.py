from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="gamesettings",
            name="daily_login_base_xp",
            field=models.IntegerField(default=10),
        ),
        migrations.AddField(
            model_name="gamesettings",
            name="daily_login_streak_step_xp",
            field=models.IntegerField(default=2),
        ),
        migrations.AddField(
            model_name="gamesettings",
            name="daily_login_max_xp",
            field=models.IntegerField(default=20),
        ),
        migrations.AddField(
            model_name="gamesettings",
            name="premium_activity_xp_multiplier",
            field=models.DecimalField(decimal_places=2, default="2.00", max_digits=5),
        ),
        migrations.AddField(
            model_name="gamesettings",
            name="default_activity_xp_per_second",
            field=models.DecimalField(decimal_places=4, default="1.0000", max_digits=5),
        ),
        migrations.AddField(
            model_name="gamesettings",
            name="activity_search_includes_tasks",
            field=models.BooleanField(default=False),
        ),
    ]
