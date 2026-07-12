from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0011_waitlist"),
    ]

    operations = [
        migrations.AddField(
            model_name="waitlist",
            name="nudge_3day_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="waitlist",
            name="nudge_7day_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="waitlist",
            name="nudge_30day_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="waitlist",
            name="nudge_removal_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
