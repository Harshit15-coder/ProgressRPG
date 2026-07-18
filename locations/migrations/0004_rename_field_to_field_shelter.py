from django.db import migrations, models


def rename_field_to_field_shelter(apps, schema_editor):
    Building = apps.get_model("locations", "Building")
    Building.objects.filter(building_type="field").update(building_type="field_shelter")


def rename_field_shelter_to_field(apps, schema_editor):
    Building = apps.get_model("locations", "Building")
    Building.objects.filter(building_type="field_shelter").update(building_type="field")


class Migration(migrations.Migration):

    dependencies = [
        ("locations", "0003_alter_building_building_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="building",
            name="building_type",
            field=models.CharField(
                choices=[
                    ("residential", "Residential"),
                    ("granary", "Granary"),
                    ("inn", "Inn"),
                    ("mill", "Mill"),
                    ("bakery", "Bakery"),
                    ("communal", "Communal"),
                    ("field_shelter", "Field Shelter"),
                ],
                default="residential",
                max_length=50,
            ),
        ),
        migrations.RunPython(
            rename_field_to_field_shelter, rename_field_shelter_to_field
        ),
    ]
