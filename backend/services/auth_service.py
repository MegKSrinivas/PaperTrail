import os
import jwt
import datetime
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy.orm import Session

from models.user import User

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
SESSION_EXPIRY_DAYS = 7


def verify_google_token(token: str) -> dict:
    """
    Verifies a Google ID token (the token Google's Sign-In button produces
    on the frontend after a successful login). This checks Google's
    cryptographic signature to confirm the token is genuine and wasn't
    forged, and that it was issued for OUR app specifically (matching our
    GOOGLE_CLIENT_ID) — not some other app's login.

    Raises an exception if the token is invalid, expired, or wasn't issued
    for this app. Returns Google's claims about the user on success:
    sub (Google's permanent user ID), email, name, picture.
    """
    claims = id_token.verify_oauth2_token(
        token, google_requests.Request(), GOOGLE_CLIENT_ID
    )
    return claims


def get_or_create_user(db: Session, google_claims: dict) -> User:
    """
    Looks up a User by their Google ID (from verified claims). Creates a
    new row on first sign-in, updates their name/picture on subsequent
    sign-ins in case those changed on Google's side.
    """
    google_id = google_claims["sub"]
    email = google_claims.get("email")
    name = google_claims.get("name")
    picture = google_claims.get("picture")

    user = db.query(User).filter(User.google_id == google_id).first()

    if user:
        # Keep name/picture fresh in case they changed on Google's side
        user.name = name
        user.picture_url = picture
        db.commit()
        return user

    user = User(
        google_id=google_id,
        email=email,
        name=name,
        picture_url=picture,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_session_token(user: User) -> str:
    """
    Issues OUR OWN JWT for this user, separate from Google's token. This is
    what the frontend will attach to future API requests (in an
    Authorization header) — we don't want the frontend re-verifying with
    Google on every single request, since Google's ID tokens are short-lived
    and meant only for the initial login handshake.
    """
    payload = {
        "user_id": str(user.id),
        "email": user.email,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=SESSION_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str) -> dict:
    """
    Verifies and decodes one of OUR session tokens (from create_session_token).
    Raises an exception if the token is invalid, tampered with, or expired.
    """
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])