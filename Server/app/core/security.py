from fastapi import Header, HTTPException

from app.core.config import settings


def verify_control_secret(x_control_secret: str = Header(...)) -> None:
    if x_control_secret != settings.control_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")
