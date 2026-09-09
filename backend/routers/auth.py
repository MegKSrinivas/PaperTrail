from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from services.auth_service import verify_google_token, get_or_create_user, create_session_token, decode_session_token
from models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleSignInRequest(BaseModel):
    token: str  # the Google ID token from the frontend's Sign-In button


@router.post("/google")
def google_sign_in(request: GoogleSignInRequest, db: Session = Depends(get_db)):
    """
    Verifies a Google ID token, creates/updates the corresponding User row,
    and returns OUR OWN session token for the frontend to use on future
    requests (via the Authorization header).
    """
    try:
        claims = verify_google_token(request.token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    user = get_or_create_user(db, claims)
    session_token = create_session_token(user)

    return {
        "token": session_token,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "picture_url": user.picture_url,
            "is_admin": user.is_admin,
        },
    }


def get_current_user(
    authorization: str = Header(...),
    db: Session = Depends(get_db),
) -> User:
    """
    A FastAPI dependency that protects a route — add `user: User =
    Depends(get_current_user)` as a parameter on any endpoint, and FastAPI
    will run this first, rejecting the request with 401 if there's no
    valid session token, before your endpoint's own code ever runs.

    Expects the header: Authorization: Bearer <our session token>
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.replace("Bearer ", "")

    try:
        payload = decode_session_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")

    user = db.query(User).filter(User.id == payload["user_id"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user