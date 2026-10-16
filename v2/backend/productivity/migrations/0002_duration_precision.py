"""Widen planning durations to fractional minutes.

The approved domain accepts any positive finite minute value; the integer
columns silently rejected valid local tasks during synchronization (integration
finding 2026-10-15). Widening int → numeric is non-destructive.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("productivity", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="plannedfocusitem",
            name="active_minutes",
            field=models.DecimalField(decimal_places=4, max_digits=12),
        ),
        migrations.AlterField(
            model_name="plannedbreak",
            name="break_minutes",
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=12, null=True),
        ),
    ]
