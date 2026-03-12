"""
SQLite database setup for user authentication and subscriptions.

Tables:
- users: email/password accounts
- sessions: JWT session tracking with device binding (7-day TTL)
- subscriptions: plan management (pro / enterprise)
- devices: per-user device registry with limits

PLACEHOLDER: This uses SQLite for development. Replace with PostgreSQL/MySQL
for production by swapping the connection logic below.
"""

import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager

DB_PATH = os.environ.get("IMPOSER_DB_PATH", str(Path(__file__).parent / "imposer.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    device_id INTEGER,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan TEXT NOT NULL DEFAULT 'pro',          -- 'pro' or 'enterprise'
    status TEXT NOT NULL DEFAULT 'active',     -- 'active', 'cancelled', 'expired', 'past_due'
    payment_id TEXT,                           -- PLACEHOLDER: Stripe subscription ID
    payment_provider TEXT DEFAULT 'none',      -- PLACEHOLDER: 'stripe', 'paddle', 'none'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_name TEXT NOT NULL DEFAULT 'Unknown Device',
    fingerprint TEXT NOT NULL,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
"""


def init_db():
    """Create all tables if they don't exist."""
    with get_db() as conn:
        conn.executescript(SCHEMA)


def cleanup_expired():
    """Remove expired sessions and devices with no active sessions."""
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at < datetime('now')")
        conn.execute(
            """DELETE FROM devices WHERE id NOT IN (
                SELECT DISTINCT device_id FROM sessions
                WHERE device_id IS NOT NULL AND expires_at > datetime('now')
            )"""
        )


@contextmanager
def get_db():
    """Yield a SQLite connection with row_factory set to dict-like rows."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# Auto-init on import
init_db()
