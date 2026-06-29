from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("server_management", "0002_featureflag"),
    ]

    operations = [
        migrations.AddField(
            model_name="maintenancewindow",
            name="scheduled_task_ids",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
