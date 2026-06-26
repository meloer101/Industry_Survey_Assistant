"""Track and cancel active ADK run_sse requests."""
from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from fastapi.responses import JSONResponse

from .auth import auth_user_from_scope


Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]
ASGIApp = Callable[[dict[str, Any], Receive, Send], Awaitable[None]]


@dataclass(frozen=True)
class RunKey:
    app_name: str
    user_id: str
    session_id: str


class ActiveRunRegistry:
    """In-memory registry of currently running SSE request tasks."""

    def __init__(self) -> None:
        self._tasks: dict[RunKey, asyncio.Task] = {}

    def register(self, key: RunKey, task: asyncio.Task) -> None:
        self._tasks[key] = task

    def unregister(self, key: RunKey, task: asyncio.Task | None = None) -> None:
        current = self._tasks.get(key)
        if current is not None and (task is None or current is task):
            self._tasks.pop(key, None)

    def get(self, key: RunKey) -> asyncio.Task | None:
        return self._tasks.get(key)

    def cancel(self, key: RunKey) -> dict[str, bool]:
        task = self._tasks.get(key)
        if task is None or task.done():
            return {"cancelled": False}
        task.cancel()
        return {"cancelled": True}


active_run_registry = ActiveRunRegistry()


class RunCancellationMiddleware:
    """Register active /run_sse request tasks so a DELETE endpoint can cancel them."""

    def __init__(
        self,
        app: ASGIApp,
        registry: ActiveRunRegistry = active_run_registry,
    ) -> None:
        self.app = app
        self.registry = registry

    async def __call__(self, scope: dict[str, Any], receive: Receive, send: Send) -> None:
        if (
            scope.get("type") != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != "/run_sse"
        ):
            await self.app(scope, receive, send)
            return

        messages = await self._read_request_messages(receive)
        body = b"".join(message.get("body", b"") for message in messages)
        key = self._run_key_from_body(body)
        task = asyncio.current_task()

        if key and not self._scope_user_owns_run(scope, key):
            response = JSONResponse(
                {"detail": "Authenticated user does not own this run"},
                status_code=403,
            )
            await response(scope, receive, send)
            return

        if key and task:
            self.registry.register(key, task)
        try:
            # Pass the original `receive` so that Starlette's
            # StreamingResponse can still await http.disconnect events
            # after the request body has been consumed.
            await self.app(scope, self._replay_receive(messages, receive), send)
        finally:
            if key and task:
                self.registry.unregister(key, task)

    @staticmethod
    async def _read_request_messages(receive: Receive) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        while True:
            message = await receive()
            messages.append(message)
            if message.get("type") != "http.request" or not message.get("more_body"):
                return messages

    @staticmethod
    def _replay_receive(
        messages: list[dict[str, Any]], original_receive: Receive
    ) -> Receive:
        pending = list(messages)

        async def receive() -> dict[str, Any]:
            if pending:
                return pending.pop(0)
            # After replaying the buffered body, fall through to the
            # original receive so http.disconnect events are delivered.
            return await original_receive()

        return receive

    @staticmethod
    def _run_key_from_body(body: bytes) -> RunKey | None:
        try:
            data = json.loads(body.decode() or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

        app_name = data.get("appName")
        user_id = data.get("userId")
        session_id = data.get("sessionId")
        if not all(isinstance(value, str) and value for value in (app_name, user_id, session_id)):
            return None
        return RunKey(app_name=app_name, user_id=user_id, session_id=session_id)

    @staticmethod
    def _scope_user_owns_run(scope: dict[str, Any], key: RunKey) -> bool:
        user = auth_user_from_scope(scope)
        if user is None:
            return True
        return user.user_id == key.user_id
