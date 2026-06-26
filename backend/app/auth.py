"""Clerk authentication and user ownership guards."""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any

import jwt
from jwt import InvalidTokenError


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: str
    session_id: str | None
    auth_type: str


class AuthError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


_USER_PATH_PATTERNS = (
    re.compile(r"^/history/(?P<user_id>[^/]+)(?:/.*)?$"),
    re.compile(r"^/apps/[^/]+/users/(?P<user_id>[^/]+)(?:/.*)?$"),
)


def is_clerk_auth_enabled() -> bool:
    return os.environ.get("CLERK_AUTH_ENABLED", "true").lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def authenticate_scope(scope: dict[str, Any]) -> AuthenticatedUser:
    """Authenticate an ASGI HTTP scope and return the resolved user."""

    if not is_clerk_auth_enabled():
        return AuthenticatedUser(
            user_id=os.environ.get("CLERK_DEV_USER_ID", "dev_user"),
            session_id=None,
            auth_type="dev",
        )

    token = _bearer_token_from_scope(scope)
    if not token:
        raise AuthError(401, "Missing Clerk bearer token")

    public_key = os.environ.get("CLERK_JWT_PUBLIC_KEY", "").replace("\\n", "\n")
    if not public_key:
        raise AuthError(500, "CLERK_JWT_PUBLIC_KEY is not configured")

    try:
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"require": ["sub", "exp", "nbf"]},
        )
    except InvalidTokenError as exc:
        raise AuthError(401, "Invalid Clerk bearer token") from exc

    azp = claims.get("azp")
    authorized_parties = _authorized_parties()
    if isinstance(azp, str) and authorized_parties and azp not in authorized_parties:
        raise AuthError(401, "Invalid Clerk authorized party")

    user_id = claims.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise AuthError(401, "Clerk token is missing subject")

    session_id = claims.get("sid")
    return AuthenticatedUser(
        user_id=user_id,
        session_id=session_id if isinstance(session_id, str) else None,
        auth_type="clerk",
    )


def is_user_scoped_path(path: str) -> bool:
    """Return True if the path contains an embedded user_id segment."""
    return _user_id_from_path(path) is not None


def assert_user_owns_path(path: str, user: AuthenticatedUser) -> None:
    """Reject paths that include a different ADK user id."""

    path_user_id = _user_id_from_path(path)
    if path_user_id is not None and path_user_id != user.user_id:
        raise AuthError(403, "Authenticated user does not own this resource")


def auth_user_from_scope(scope: dict[str, Any]) -> AuthenticatedUser | None:
    user = scope.get("auth_user")
    if isinstance(user, AuthenticatedUser):
        return user
    if isinstance(user, dict) and isinstance(user.get("user_id"), str):
        return AuthenticatedUser(
            user_id=user["user_id"],
            session_id=user.get("session_id") if isinstance(user.get("session_id"), str) else None,
            auth_type=user.get("auth_type") if isinstance(user.get("auth_type"), str) else "unknown",
        )
    return None


def _bearer_token_from_scope(scope: dict[str, Any]) -> str | None:
    headers = dict(scope.get("headers", []))
    auth_header = headers.get(b"authorization", b"").decode()
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def _authorized_parties() -> set[str]:
    raw = os.environ.get("CLERK_AUTHORIZED_PARTIES", "")
    return {party.strip() for party in raw.split(",") if party.strip()}


def _user_id_from_path(path: str) -> str | None:
    for pattern in _USER_PATH_PATTERNS:
        match = pattern.match(path)
        if match:
            return match.group("user_id")
    return None
