from django.db import migrations, models


def convert_access_level_to_groups(apps, schema_editor):
    FeatureFlag = apps.get_model("server_management", "FeatureFlag")
    for flag in FeatureFlag.objects.all():
        level = flag.access_level or "no"
        flag.access_groups = [] if level == "no" else [level]
        flag.save(update_fields=["access_groups"])


class Migration(migrations.Migration):

    dependencies = [
        ("server_management", "0002_featureflag"),
    ]

    operations = [
        migrations.AddField(
            model_name="featureflag",
            name="access_groups",
            field=models.JSONField(
                default=list,
                help_text="List of groups that can access this feature: 'all', 'premium', 'testers'.",
            ),
        ),
        migrations.RunPython(
            convert_access_level_to_groups,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.RemoveField(
            model_name="featureflag",
            name="access_level",
        ),
    ]
