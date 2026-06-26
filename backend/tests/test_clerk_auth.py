import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def _generate_test_keys() -> tuple[str, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


TEST_PRIVATE_KEY, TEST_PUBLIC_KEY = _generate_test_keys()


def _token(sub: str = "user_a", *, azp: str | None = "http://localhost:5173", exp_delta: int = 300):
    import jwt

    now = int(time.time())
    claims = {
        "sub": sub,
        "sid": "sess_123",
        "iat": now,
        "nbf": now - 10,
        "exp": now + exp_delta,
    }
    if azp is not None:
        claims["azp"] = azp
    return jwt.encode(claims, TEST_PRIVATE_KEY, algorithm="RS256")


def test_clerk_auth_verifies_valid_token(monkeypatch):
    from app.auth import authenticate_scope

    monkeypatch.setenv("CLERK_AUTH_ENABLED", "true")
    monkeypatch.setenv("CLERK_JWT_PUBLIC_KEY", TEST_PUBLIC_KEY)
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", "http://localhost:5173")

    user = authenticate_scope(
        {"headers": [(b"authorization", f"Bearer {_token()}".encode())]}
    )

    assert user.user_id == "user_a"
    assert user.session_id == "sess_123"
    assert user.auth_type == "clerk"


def test_clerk_auth_rejects_missing_token(monkeypatch):
    from app.auth import AuthError, authenticate_scope

    monkeypatch.setenv("CLERK_AUTH_ENABLED", "true")
    monkeypatch.setenv("CLERK_JWT_PUBLIC_KEY", TEST_PUBLIC_KEY)

    with pytest.raises(AuthError) as exc:
        authenticate_scope({"headers": []})

    assert exc.value.status_code == 401


def test_clerk_auth_rejects_disallowed_azp(monkeypatch):
    from app.auth import AuthError, authenticate_scope

    monkeypatch.setenv("CLERK_AUTH_ENABLED", "true")
    monkeypatch.setenv("CLERK_JWT_PUBLIC_KEY", TEST_PUBLIC_KEY)
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", "http://localhost:5173")

    with pytest.raises(AuthError) as exc:
        authenticate_scope(
            {"headers": [(b"authorization", f"Bearer {_token(azp='https://evil.test')}".encode())]}
        )

    assert exc.value.status_code == 401


def test_clerk_auth_rejects_expired_token(monkeypatch):
    from app.auth import AuthError, authenticate_scope

    monkeypatch.setenv("CLERK_AUTH_ENABLED", "true")
    monkeypatch.setenv("CLERK_JWT_PUBLIC_KEY", TEST_PUBLIC_KEY)
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", "http://localhost:5173")

    with pytest.raises(AuthError) as exc:
        authenticate_scope(
            {"headers": [(b"authorization", f"Bearer {_token(exp_delta=-60)}".encode())]}
        )

    assert exc.value.status_code == 401


def test_clerk_auth_dev_bypass_uses_configured_user(monkeypatch):
    from app.auth import authenticate_scope

    monkeypatch.setenv("CLERK_AUTH_ENABLED", "false")
    monkeypatch.setenv("CLERK_DEV_USER_ID", "dev_user")

    user = authenticate_scope({"headers": []})

    assert user.user_id == "dev_user"
    assert user.auth_type == "dev"
