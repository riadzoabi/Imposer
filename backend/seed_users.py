"""
Seed script: creates two dummy users with subscriptions.

  1. enterprise@test.com / password123  → Enterprise plan (4 devices)
  2. user@test.com      / password123  → Pro plan (1 device)

Run: python seed_users.py
"""

from auth import register_user, _hash_password
from subscription import _activate_subscription
from database import get_db

USERS = [
    {"email": "enterprise@test.com", "password": "password123", "plan": "enterprise"},
    {"email": "user@test.com",       "password": "password123", "plan": "pro"},
]

def seed():
    for u in USERS:
        try:
            result = register_user(u["email"], u["password"])
            _activate_subscription(result["user_id"], u["plan"])
            print(f"Created {u['email']} with {u['plan']} plan (id={result['user_id']})")
        except ValueError as e:
            # Already exists — just ensure subscription
            with get_db() as conn:
                row = conn.execute("SELECT id FROM users WHERE email = ?", (u["email"],)).fetchone()
                if row:
                    _activate_subscription(row["id"], u["plan"])
                    print(f"Already exists: {u['email']} — refreshed {u['plan']} subscription")

if __name__ == "__main__":
    seed()
