import io
import json
import logging
import sqlite3
import time
from pathlib import Path


def _create_session_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            """
            CREATE TABLE sessions (
                app_name TEXT NOT NULL,
                user_id TEXT NOT NULL,
                id TEXT NOT NULL,
                state TEXT NOT NULL,
                create_time REAL NOT NULL,
                update_time REAL NOT NULL,
                PRIMARY KEY (app_name, user_id, id)
            );
            CREATE TABLE events (
                id TEXT NOT NULL,
                app_name TEXT NOT NULL,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                invocation_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                event_data TEXT NOT NULL,
                PRIMARY KEY (app_name, user_id, session_id, id),
                FOREIGN KEY (app_name, user_id, session_id)
                    REFERENCES sessions(app_name, user_id, id) ON DELETE CASCADE
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def _insert_session(
    db_path: Path,
    *,
    user_id: str,
    session_id: str,
    update_time: float,
    state: dict,
) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            INSERT INTO sessions(app_name, user_id, id, state, create_time, update_time)
            VALUES ('app', ?, ?, ?, ?, ?)
            """,
            (user_id, session_id, json.dumps(state), update_time, update_time),
        )
        conn.execute(
            """
            INSERT INTO events(id, app_name, user_id, session_id, invocation_id, timestamp, event_data)
            VALUES (?, 'app', ?, ?, 'invocation', ?, '{}')
            """,
            (f"event-{session_id}", user_id, session_id, update_time),
        )
        conn.commit()
    finally:
        conn.close()


def test_json_logging_includes_request_id(monkeypatch):
    from app.logging_config import RequestIdContext, configure_logging

    stream = io.StringIO()
    monkeypatch.setenv("LOG_FORMAT", "json")
    monkeypatch.setenv("LOG_LEVEL", "INFO")

    configure_logging(stream=stream)
    with RequestIdContext("req-test-123"):
        logging.getLogger("tests.observability").info("pipeline finished")

    payload = json.loads(stream.getvalue())
    assert payload["level"] == "INFO"
    assert payload["logger"] == "tests.observability"
    assert payload["request_id"] == "req-test-123"
    assert payload["message"] == "pipeline finished"


def test_api_key_auth_documents_header_only_csrf_boundary():
    from app.main import API_KEY_HEADER_NAME, COOKIE_AUTH_SUPPORTED

    assert API_KEY_HEADER_NAME == "X-API-Key"
    assert COOKIE_AUTH_SUPPORTED is False


def test_cleanup_old_sessions_deletes_events_for_expired_sessions(tmp_path):
    from app.tools.session_cleanup import cleanup_old_sessions

    db_path = tmp_path / "session.db"
    _create_session_db(db_path)
    now = time.time()
    old_update_time = now - (31 * 24 * 60 * 60)
    recent_update_time = now - (2 * 24 * 60 * 60)

    _insert_session(
        db_path,
        user_id="u_test",
        session_id="old-session",
        update_time=old_update_time,
        state={"research_plan": "old plan"},
    )
    _insert_session(
        db_path,
        user_id="u_test",
        session_id="recent-session",
        update_time=recent_update_time,
        state={"research_plan": "recent plan"},
    )

    result = cleanup_old_sessions(db_path=db_path, ttl_days=30, now=now)

    assert result == {"sessions": 1, "events": 1}
    conn = sqlite3.connect(db_path)
    try:
        remaining_sessions = conn.execute("SELECT id FROM sessions").fetchall()
        remaining_events = conn.execute("SELECT session_id FROM events").fetchall()
    finally:
        conn.close()

    assert remaining_sessions == [("recent-session",)]
    assert remaining_events == [("recent-session",)]


def test_list_research_history_reads_session_state_newest_first(tmp_path):
    from app.persistence import list_research_history

    db_path = tmp_path / "session.db"
    _create_session_db(db_path)
    now = time.time()
    _insert_session(
        db_path,
        user_id="u_1",
        session_id="older",
        update_time=now - 60,
        state={"research_plan": "older plan\nsecond line"},
    )
    _insert_session(
        db_path,
        user_id="u_1",
        session_id="newer",
        update_time=now,
        state={
            "research_plan": "newer plan\nsecond line",
            "final_report_with_citations": "report body",
        },
    )
    _insert_session(
        db_path,
        user_id="other_user",
        session_id="other",
        update_time=now + 60,
        state={"research_plan": "other plan"},
    )

    history = list_research_history(db_path=db_path, user_id="u_1", limit=20)

    assert [item["session_id"] for item in history] == ["newer", "older"]
    assert history[0]["research_plan"] == "newer plan\nsecond line"
    assert history[0]["title"] == "newer plan"
    assert history[0]["has_final_report"] is True
    assert history[1]["has_final_report"] is False
    assert "T" in history[0]["update_time"]


def test_list_research_history_supports_offset_pagination(tmp_path):
    from app.persistence import list_research_history

    db_path = tmp_path / "session.db"
    _create_session_db(db_path)
    now = time.time()
    _insert_session(
        db_path,
        user_id="u_1",
        session_id="newest",
        update_time=now,
        state={"research_plan": "newest plan"},
    )
    _insert_session(
        db_path,
        user_id="u_1",
        session_id="middle",
        update_time=now - 60,
        state={"research_plan": "middle plan"},
    )
    _insert_session(
        db_path,
        user_id="u_1",
        session_id="oldest",
        update_time=now - 120,
        state={"research_plan": "oldest plan"},
    )

    page = list_research_history(db_path=db_path, user_id="u_1", limit=1, offset=1)

    assert [item["session_id"] for item in page] == ["middle"]
