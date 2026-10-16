"""Generate disposable local TLS/config outside Git; never reuse for production."""
import argparse
import os
from pathlib import Path
import secrets
import subprocess


def prepare(directory):
    directory = Path(directory).resolve()
    directory.mkdir(mode=0o700)  # Refuse to overwrite existing credentials.
    for name, san in (("app", "DNS:localhost,IP:127.0.0.1"), ("db", "DNS:db")):
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
            "-subj", f"/CN={'localhost' if name == 'app' else 'db'}",
            "-addext", f"subjectAltName={san}",
            "-keyout", str(directory / f"{name}.key"),
            "-out", str(directory / f"{name}.crt"),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Individual bind-mounted secrets must be readable by the container UID.
        # The host parent stays 0700; never copy these keys to a public directory.
        (directory / f"{name}.key").chmod(0o644)
    values = {
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
        "DJANGO_ALLOWED_HOSTS": "localhost,127.0.0.1",
        "SPACE_BOXES_DB_NAME": "space_boxes_v2",
        "SPACE_BOXES_DB_USER": "spaceboxes",
        "SPACE_BOXES_DB_PASSWORD": secrets.token_urlsafe(32),
        "SPACE_BOXES_POSTGRES_PASSWORD": secrets.token_urlsafe(32),
        "SPACE_BOXES_TLS_DIR": str(directory),
        "SPACE_BOXES_EMAIL_HOST": "smtp.invalid",
        "SPACE_BOXES_FROM_EMAIL": "no-reply@example.invalid",
    }
    env_file = directory / "compose.env"
    # Private metadata must never be printed by compose config or debug logging.
    fd = os.open(env_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.writelines(f"{key}={value}\n" for key, value in values.items())
    return env_file


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", help="new private directory outside the repository")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    target = Path(args.directory).resolve()
    if target.is_relative_to(repo):
        parser.error("choose a directory outside the repository")
    print(prepare(target))
