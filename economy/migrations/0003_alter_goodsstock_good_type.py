from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("economy", "0002_alter_goodsstock_good_type_goodsconversionstate"),
    ]

    operations = [
        migrations.AlterField(
            model_name="goodsstock",
            name="good_type",
            field=models.CharField(max_length=20),
        ),
    ]
