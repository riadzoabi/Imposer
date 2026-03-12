"""
FastAPI dependencies for authentication and subscription enforcement.

Usage in routes:
    @app.get("/api/protected")
    async def protected(user = Depends(require_auth)):
        ...

    @app.get("/api/subscriber-only")
    async def subscriber(user = Depends(require_subscription_dep)):
        ...
"""

from fastapi import Request, HTTPException, Depends

from auth import validate_token
from subscription import require_subscription, check_device_limit


def _extract_token(request: Request) -> str:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    raise HTTPException(401, "Missing or invalid Authorization header.")


async def require_auth(request: Request) -> dict:
    """
    FastAPI dependency: validates JWT and returns user info.
    Raises 401 if token is invalid or expired.
    """
    token = _extract_token(request)
    user = validate_token(token)
    if not user:
        raise HTTPException(401, "Invalid or expired session. Please log in again.")

    # Attach token to user dict for downstream use (e.g. logout)
    user["token"] = token
    return user


async def require_subscription_dep(user: dict = Depends(require_auth)) -> dict:
    """
    FastAPI dependency: validates auth AND active subscription.
    Raises 403 if no active subscription.
    """
    try:
        sub = require_subscription(user["user_id"])
    except ValueError as e:
        raise HTTPException(403, str(e))

    # Check device limit
    device_check = check_device_limit(user["user_id"])
    if not device_check["allowed"]:
        raise HTTPException(
            403,
            f"Device limit reached ({device_check['current']}/{device_check['max']}). "
            f"Remove a device or upgrade to Enterprise for more devices.",
        )

    user["subscription"] = sub
    return user
