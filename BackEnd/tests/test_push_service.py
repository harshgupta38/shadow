"""Web push service key normalization tests."""

from __future__ import annotations

import base64

from sqlalchemy import select

from app.constant import settings
from app.database import SessionLocal
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services import push_service


def _decode_base64url(value: str) -> bytes:
    padded = value + ("=" * ((4 - (len(value) % 4)) % 4))
    return base64.urlsafe_b64decode(padded)


def test_get_public_key_payload_normalizes_der_encoded_key(monkeypatch) -> None:
    der_public_key_b64 = (
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE54/AwzgewtGnhZwO/tJRgeDLRHfZU5o1"
        "dhSzmif+Avb2XU/R+ba2eY7oemu7whelagEf/gzlrpAujHVreOF4Ng=="
    )

    monkeypatch.setattr(settings, "web_push_vapid_public_key", der_public_key_b64)
    monkeypatch.setattr(settings, "web_push_vapid_private_key", "dummy-private-key")
    monkeypatch.setattr(settings, "web_push_vapid_subject", "mailto:test@example.com")

    payload = push_service.get_public_key_payload()

    assert payload["configured"] is True
    assert isinstance(payload["public_key"], str)
    assert "=" not in payload["public_key"]

    decoded = _decode_base64url(payload["public_key"])
    assert len(decoded) == 65
    assert decoded[0] == 0x04


def test_get_public_key_payload_keeps_base64url_uncompressed_key(monkeypatch) -> None:
    browser_compatible_key = (
        "BMzfyxQN9W_qHDMQDdoTx9Cqn1YEQXWRHiEjzrXm4ZUd4yAuFDjYWUWFm8oDrkEH"
        "PCq_3B6AHjGCZdyAM1EEqhI"
    )

    monkeypatch.setattr(settings, "web_push_vapid_public_key", browser_compatible_key)
    monkeypatch.setattr(settings, "web_push_vapid_private_key", "dummy-private-key")
    monkeypatch.setattr(settings, "web_push_vapid_subject", "mailto:test@example.com")

    payload = push_service.get_public_key_payload()

    assert payload["configured"] is True
    assert payload["public_key"] == browser_compatible_key


def test_send_push_prunes_forbidden_subscription(monkeypatch) -> None:
    monkeypatch.setattr(
        settings,
        "web_push_vapid_public_key",
        "BMzfyxQN9W_qHDMQDdoTx9Cqn1YEQXWRHiEjzrXm4ZUd4yAuFDjYWUWFm8oDrkEHPCq_3B6AHjGCZdyAM1EEqhI",
    )
    monkeypatch.setattr(settings, "web_push_vapid_private_key", "dummy-private-key")
    monkeypatch.setattr(settings, "web_push_vapid_subject", "mailto:test@example.com")

    class _Response:
        status_code = 403

    class _ForbiddenPushError(Exception):
        def __init__(self) -> None:
            super().__init__("forbidden")
            self.response = _Response()

    def _raise_forbidden(*args, **kwargs):
        raise _ForbiddenPushError()

    monkeypatch.setattr(push_service, "WebPushException", _ForbiddenPushError)
    monkeypatch.setattr(push_service, "webpush", _raise_forbidden)

    with SessionLocal() as db:
        user = User(email="push-user@example.com", hashed_password="x", name="Push User")
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add(
            PushSubscription(
                user_id=user.id,
                endpoint="https://web.push.apple.com/test-endpoint",
                p256dh="test-p256dh",
                auth="test-auth",
            )
        )
        db.commit()

        sent = push_service.send_push_to_user(
            db,
            user,
            title="Test",
            body="Body",
        )
        assert sent == 0

        remaining = list(
            db.scalars(select(PushSubscription).where(PushSubscription.user_id == user.id))
        )
        assert remaining == []
