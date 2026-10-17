"""Add email verification without locking out existing active accounts."""

from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def preserve_existing_accounts(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.using(schema_editor.connection.alias).filter(
        is_active=True, email_verified_at__isnull=True
    ).update(email_verified_at=django.utils.timezone.now())


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="EmailVerificationToken",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("request_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="email_verification_tokens", to="accounts.user")),
            ],
        ),
        migrations.RunPython(preserve_existing_accounts, migrations.RunPython.noop),
    ]
