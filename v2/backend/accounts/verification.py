"""Single-use email verification links for newly registered accounts."""

from urllib.parse import quote

from django.conf import settings
from django.core.mail import send_mail

from .models import EmailVerificationToken


def send_verification_email(user, request_ip=None):
    """Issue and send a token; delivery errors propagate to caller."""
    secret = EmailVerificationToken.issue(user, request_ip=request_ip)
    # Fragments never travel in HTTP request/access logs or Referer headers.
    link = f"{settings.SPACE_BOXES_PUBLIC_WEB_URL}/#verify={quote(secret, safe='')}"
    delivered = send_mail(
        subject="Confirm your Space Boxes email",
        message=(
            "Please verify that you own this email address before signing in to Space Boxes.\n\n"
            f"Confirm your email: {link}\n\n"
            "This one-use verification link expires after 24 hours. "
            "If you did not create a Space Boxes account, ignore this message."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
    if delivered != 1:
        raise RuntimeError("Verification message was not accepted by the email backend")
    return delivered
