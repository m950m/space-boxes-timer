"""Verified-email recovery messages (OD-11). Generic wording, single-use."""

from django.conf import settings
from django.core.mail import send_mail


def send_recovery_email(user, secret, purpose="recovery"):
    """Send the single-use recovery secret. Delivery failures propagate so
    callers can report honestly instead of claiming an email was sent."""
    delivered = send_mail(
        subject="Space Boxes account recovery",
        message=(
            "A recovery request was made for your Space Boxes account.\n\n"
            "Use this single-use code to choose a new password:\n"
            f"{secret}\n\n"
            "The code expires after one hour and can be used only once. "
            "If you did not request it, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
    if delivered != 1:
        raise RuntimeError("Recovery message was not accepted by the email backend")
