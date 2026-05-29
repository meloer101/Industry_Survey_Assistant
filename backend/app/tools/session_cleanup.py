"""Prune ADK sessions and events older than a configurable TTL."""
from __future__ import annotations

import logging
import os
import sqlite3
import time
from pathlib import Path

from app.persistence import DEFAULT_SESSION_DB_PATH


logger = logging.getLogger(__name__)

DEFAULT_TTL_DAYS = int(os.environ.get("SESSION_TTL_DAYS", "30"))


def cleanup_old_sessions(
    *,
    db_path: Path = DEFAULT_SESSION_DB_PATH,
    ttl_days: int = DEFAULT_TTL_DAYS,
    now: float | None = None,
) -> dict[str, int]:
    """Delete sessions and their events older than ttl_days."""

    if not db_path.exists():
        logger.info("session_cleanup: database does not exist at %s", db_path)
        return {"sessions": 0, "events": 0}

    current_time = time.time() if now is None else now
    cutoff = current_time - (ttl_days * 24 * 60 * 60)

    conn = sqlite3.connect(db_path)
    try:
        old_sessions = conn.execute(
            """
            SELECT app_name, user_id, id
            FROM sessions
            WHERE update_time < ?
            """,
            (cutoff,),
        ).fetchall()

        if not old_sessions:
            logger.info("session_cleanup: no sessions older than %d days", ttl_days)
            return {"sessions": 0, "events": 0}

        deleted_events = 0
        deleted_sessions = 0
        for app_name, user_id, session_id in old_sessions:
            deleted_events += conn.execute(
                """
                DELETE FROM events
                WHERE app_name = ? AND user_id = ? AND session_id = ?
                """,
                (app_name, user_id, session_id),
            ).rowcount
            deleted_sessions += conn.execute(
                """
                DELETE FROM sessions
                WHERE app_name = ? AND user_id = ? AND id = ?
                """,
                (app_name, user_id, session_id),
            ).rowcount

        conn.commit()
        logger.info(
            "session_cleanup: deleted %d sessions, %d events (ttl=%d days)",
            deleted_sessions,
            deleted_events,
            ttl_days,
        )
        return {"sessions": deleted_sessions, "events": deleted_events}
    finally:
        conn.close()


if __name__ == "__main__":
    print(cleanup_old_sessions())
