from django.db import migrations


def disable_wander_tick(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name="wander_tick").update(enabled=False)


def reenable_wander_tick(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name="wander_tick").update(enabled=True)


class Migration(migrations.Migration):
    """
    django_celery_beat's DatabaseScheduler only ADDS new entries from
    settings.CELERYBEAT_SCHEDULE (app.conf.beat_schedule) - it never removes
    or disables ones no longer listed there. Replacing the "wander_tick"
    beat entry with "commute_tick" in progress_rpg/celery.py therefore left
    the old wander_tick PeriodicTask row enabled in the DB, running forever
    alongside the new task. This disables it explicitly on deploy.
    """

    dependencies = [
        ("locations", "0001_initial"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(disable_wander_tick, reenable_wander_tick),
    ]
