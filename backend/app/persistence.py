"""Session persistence helpers for ADK's local SQLite storage."""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_SESSION_DB_PATH = Path(__file__).parent / ".adk" / "session.db"
DEFAULT_SESSION_DB_URL = f"sqlite:///{DEFAULT_SESSION_DB_PATH}"


def get_session_db_url() -> str:
    """Return the configured ADK session service URI."""

    return os.environ.get("SESSION_DB_URL", DEFAULT_SESSION_DB_URL)


def get_sqlite_path_from_url(session_db_url: str | None = None) -> Path | None:
    """Extract a local SQLite path from a session service URI."""

    url = session_db_url or get_session_db_url()
    if not url.startswith("sqlite:///"):
        return None
    return Path(url.removeprefix("sqlite:///"))


def _parse_session_state(raw_state: str) -> dict[str, Any]:
    try:
        state = json.loads(raw_state)
    except json.JSONDecodeError:
        return {}
    return state if isinstance(state, dict) else {}


def _format_update_time(value: float) -> str:
    return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()


def _title_from_plan(research_plan: str | None) -> str:
    if not research_plan:
        return "未命名研究"
    return next((line.strip() for line in research_plan.splitlines() if line.strip()), "未命名研究")


def list_research_history(
    *,
    db_path: Path,
    user_id: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Return recent research sessions for a user from ADK's SQLite schema."""

    if not db_path.exists():
        return []

    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT id, update_time, state
            FROM sessions
            WHERE user_id = ?
            ORDER BY update_time DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    finally:
        conn.close()

    history: list[dict[str, Any]] = []
    for session_id, update_time, raw_state in rows:
        state = _parse_session_state(raw_state)
        research_plan = state.get("research_plan")
        if research_plan is not None and not isinstance(research_plan, str):
            research_plan = str(research_plan)
        final_report = state.get("final_report_with_citations")
        history.append(
            {
                "session_id": session_id,
                "update_time": _format_update_time(float(update_time)),
                "research_plan": research_plan,
                "title": _title_from_plan(research_plan),
                "has_final_report": bool(final_report),
            }
        )
    return history
