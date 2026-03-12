"""
Subscription management: plan checks, device limits, payment stubs.

Plans:
  - pro:        Full access, 1 device
  - enterprise: Full access, up to 4 devices

PLACEHOLDER: Payment integration. All payment functions are stubs.
Replace with Stripe/Paddle when going live.
"""

from datetime import datetime, timedelta, timezone

from database import get_db

# ── Plan definitions ───────────────────────────────────────────────

PLANS = {
    "pro": {
        "name": "Pro",
        "max_devices": 1,
        "price_monthly": 0,      # PLACEHOLDER: set real price
        "price_yearly": 0,       # PLACEHOLDER: set real price
        "features": ["all_features"],
    },
    "enterprise": {
        "name": "Enterprise",
        "max_devices": 4,
        "price_monthly": 0,      # PLACEHOLDER: set real price
        "price_yearly": 0,       # PLACEHOLDER: set real price
        "features": ["all_features", "multi_device"],
    },
}


def get_plan_info(plan_name: str) -> dict | None:
    """Return plan details or None if invalid."""
    return PLANS.get(plan_name)


def get_active_subscription(user_id: int) -> dict | None:
    """Return the user's active subscription or None."""
    with get_db() as conn:
        row = conn.execute(
            """SELECT * FROM subscriptions
               WHERE user_id = ? AND status = 'active'
               AND (expires_at IS NULL OR expires_at > ?)
               ORDER BY id DESC LIMIT 1""",
            (user_id, datetime.now(timezone.utc).isoformat()),
        ).fetchone()
        return dict(row) if row else None


def check_device_limit(user_id: int) -> dict:
    """
    Check if user is within their device limit.
    Returns {"allowed": bool, "current": int, "max": int, "plan": str}
    """
    sub = get_active_subscription(user_id)
    if not sub:
        return {"allowed": False, "current": 0, "max": 0, "plan": None}

    plan = PLANS.get(sub["plan"], PLANS["pro"])
    max_devices = plan["max_devices"]

    with get_db() as conn:
        # Only count devices with active sessions (not stale ones)
        count = conn.execute(
            """SELECT COUNT(DISTINCT d.id) as cnt FROM devices d
               INNER JOIN sessions s ON s.device_id = d.id AND s.user_id = d.user_id
               WHERE d.user_id = ? AND s.expires_at > datetime('now')""",
            (user_id,),
        ).fetchone()["cnt"]

    return {
        "allowed": count <= max_devices,
        "current": count,
        "max": max_devices,
        "plan": sub["plan"],
    }


def require_subscription(user_id: int) -> dict:
    """
    Verify user has an active subscription. Returns subscription dict.
    Raises ValueError if no active subscription.
    """
    sub = get_active_subscription(user_id)
    if not sub:
        raise ValueError("Active subscription required. Please subscribe to continue.")
    return sub


# ── Payment stubs ──────────────────────────────────────────────────
# PLACEHOLDER: Replace these functions with real payment provider calls.

def create_checkout_session(user_id: int, plan: str, billing_cycle: str = "monthly") -> dict:
    """
    PLACEHOLDER: Create a payment checkout session.
    In production, this would call Stripe.checkout.sessions.create() or similar.

    Returns {"checkout_url": str, "session_id": str}
    """
    # For development: auto-activate subscription
    _activate_subscription(user_id, plan)

    return {
        "checkout_url": "/subscription/success",   # PLACEHOLDER: Stripe checkout URL
        "session_id": f"placeholder_{user_id}_{plan}",
    }


def handle_webhook(payload: dict) -> dict:
    """
    PLACEHOLDER: Handle payment provider webhook.
    In production, this would verify webhook signature and process events like:
    - checkout.session.completed → activate subscription
    - invoice.payment_failed → mark subscription as past_due
    - customer.subscription.deleted → mark as cancelled

    Returns {"status": "processed"} or raises.
    """
    event_type = payload.get("type", "")

    if event_type == "checkout.session.completed":
        user_id = payload.get("user_id")
        plan = payload.get("plan", "pro")
        if user_id:
            _activate_subscription(user_id, plan)

    elif event_type == "subscription.cancelled":
        user_id = payload.get("user_id")
        if user_id:
            cancel_subscription(user_id)

    return {"status": "processed"}


def cancel_subscription(user_id: int):
    """Mark user's active subscription as cancelled."""
    with get_db() as conn:
        conn.execute(
            "UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'",
            (user_id,),
        )


def _activate_subscription(user_id: int, plan: str, payment_id: str | None = None):
    """Create or reactivate a subscription for the user."""
    if plan not in PLANS:
        raise ValueError(f"Unknown plan: {plan}")

    expires_at = datetime.now(timezone.utc) + timedelta(days=30)  # PLACEHOLDER: real billing cycle

    with get_db() as conn:
        # Deactivate any existing active subscriptions
        conn.execute(
            "UPDATE subscriptions SET status = 'replaced' WHERE user_id = ? AND status = 'active'",
            (user_id,),
        )

        conn.execute(
            """INSERT INTO subscriptions (user_id, plan, status, payment_id, payment_provider, expires_at)
               VALUES (?, ?, 'active', ?, 'none', ?)""",
            (user_id, plan, payment_id, expires_at.isoformat()),
        )
