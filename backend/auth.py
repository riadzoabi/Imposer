"""
Authentication module: registration, login, JWT tokens, session management.

Sessions are valid for 7 days. Each login binds to a device fingerprint.
Device limits are enforced by the subscription module.
"""

import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

from database import get_db

# ── JWT configuration ──────────────────────────────────────────────
# PLACEHOLDER: In production, set IMPOSER_JWT_SECRET via environment variable
JWT_SECRET = os.environ.get("IMPOSER_JWT_SECRET", "dev-secret-change-me-in-production")
JWT_ALGORITHM = "HS256"
SESSION_DURATION_DAYS = 7


# ── Password hashing ──────────────────────────────────────────────
# Using hashlib for zero-dependency setup. PLACEHOLDER: swap for bcrypt in production.

def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}:{h.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    salt, expected = stored.split(":", 1)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return hmac.compare_digest(h.hex(), expected)


# ── Minimal JWT implementation (no PyJWT dependency) ──────────────
# PLACEHOLDER: Replace with `import jwt` / PyJWT for production.

import base64

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64url_decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)

def _create_jwt(payload: dict) -> str:
    header = _b64url_encode(json.dumps({"alg": JWT_ALGORITHM, "typ": "JWT"}).encode())
    body = _b64url_encode(json.dumps(payload).encode())
    sig_input = f"{header}.{body}".encode()
    sig = hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest()
    return f"{header}.{body}.{_b64url_encode(sig)}"

def _decode_jwt(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        sig_input = f"{parts[0]}.{parts[1]}".encode()
        expected_sig = hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest()
        actual_sig = _b64url_decode(parts[2])
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_b64url_decode(parts[1]))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


# ── Public API ─────────────────────────────────────────────────────

def register_user(email: str, password: str) -> dict:
    """Create a new user account. Returns {"user_id": int} or raises ValueError."""
    email = email.strip().lower()
    if not email or "@" not in email:
        raise ValueError("Invalid email address.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters.")

    pw_hash = _hash_password(password)

    with get_db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email, pw_hash),
            )
            return {"user_id": cur.lastrowid, "email": email}
        except Exception:
            raise ValueError("An account with this email already exists.")


def login_user(email: str, password: str, device_fingerprint: str, device_name: str = "Browser") -> dict:
    """
    Authenticate user, register/verify device, create session.
    Returns {"token": str, "user": dict, "subscription": dict|None} or raises ValueError.
    """
    email = email.strip().lower()

    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not row:
            raise ValueError("Invalid email or password.")

        if not _verify_password(password, row["password_hash"]):
            raise ValueError("Invalid email or password.")

        user_id = row["id"]

        # Register or update device
        device_id = _register_device(conn, user_id, device_fingerprint, device_name)

        # Create session token (7-day expiry)
        expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DURATION_DAYS)
        payload = {
            "sub": user_id,
            "email": email,
            "device_id": device_id,
            "exp": int(expires_at.timestamp()),
        }
        token = _create_jwt(payload)

        conn.execute(
            "INSERT INTO sessions (user_id, token, device_id, expires_at) VALUES (?, ?, ?, ?)",
            (user_id, token, device_id, expires_at.isoformat()),
        )

        # Fetch subscription
        sub = conn.execute(
            "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
            (user_id,),
        ).fetchone()

        return {
            "token": token,
            "expires_at": expires_at.isoformat(),
            "user": {"id": user_id, "email": email},
            "subscription": dict(sub) if sub else None,
        }


def validate_token(token: str) -> dict | None:
    """
    Validate a JWT token and return user info if valid.
    Returns {"user_id", "email", "device_id"} or None.
    """
    payload = _decode_jwt(token)
    if not payload:
        return None

    # Check session still exists in DB (allows server-side revocation)
    with get_db() as conn:
        session = conn.execute(
            "SELECT * FROM sessions WHERE token = ? AND expires_at > ?",
            (token, datetime.now(timezone.utc).isoformat()),
        ).fetchone()
        if not session:
            return None

        # Update device last_active
        if payload.get("device_id"):
            conn.execute(
                "UPDATE devices SET last_active = CURRENT_TIMESTAMP WHERE id = ?",
                (payload["device_id"],),
            )

    return {
        "user_id": payload["sub"],
        "email": payload["email"],
        "device_id": payload.get("device_id"),
    }


def logout_user(token: str):
    """Revoke a session token."""
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def get_user_devices(user_id: int) -> list[dict]:
    """Return all registered devices for a user."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, device_name, fingerprint, last_active, created_at FROM devices WHERE user_id = ? ORDER BY last_active DESC",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def remove_device(user_id: int, device_id: int):
    """Remove a device and revoke all its sessions."""
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND device_id = ?", (user_id, device_id))
        conn.execute("DELETE FROM devices WHERE id = ? AND user_id = ?", (device_id, user_id))


def _register_device(conn, user_id: int, fingerprint: str, name: str) -> int:
    """Register device or return existing device ID. Updates last_active."""
    row = conn.execute(
        "SELECT id FROM devices WHERE user_id = ? AND fingerprint = ?",
        (user_id, fingerprint),
    ).fetchone()

    if row:
        conn.execute(
            "UPDATE devices SET last_active = CURRENT_TIMESTAMP, device_name = ? WHERE id = ?",
            (name, row["id"]),
        )
        return row["id"]

    cur = conn.execute(
        "INSERT INTO devices (user_id, fingerprint, device_name) VALUES (?, ?, ?)",
        (user_id, fingerprint, name),
    )
    return cur.lastrowid
