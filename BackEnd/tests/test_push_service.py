"""Web push service key normalization tests."""

from __future__ import annotations

import base64
from types import SimpleNamespace
from urllib.parse import urlparse

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


def test_send_push_keeps_forbidden_subscription(monkeypatch) -> None:
    monkeypatch.setattr(
        settings,
        "web_push_vapid_public_key",
        "BMzfyxQN9W_qHDMQDdoTx9Cqn1YEQXWRHiEjzrXm4ZUd4yAuFDjYWUWFm8oDrkEHPCq_3B6AHjGCZdyAM1EEqhI",
    )
    monkeypatch.setattr(settings, "web_push_vapid_private_key", "dummy-private-key")
    monkeypatch.setattr(settings, "web_push_vapid_subject", "mailto:test@example.com")

    class _Response:
        status_code = 403
        text = "forbidden"

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
        assert len(remaining) == 1


def test_send_push_prunes_gone_subscription(monkeypatch) -> None:
    monkeypatch.setattr(
        settings,
        "web_push_vapid_public_key",
        "BMzfyxQN9W_qHDMQDdoTx9Cqn1YEQXWRHiEjzrXm4ZUd4yAuFDjYWUWFm8oDrkEHPCq_3B6AHjGCZdyAM1EEqhI",
    )
    monkeypatch.setattr(settings, "web_push_vapid_private_key", "dummy-private-key")
    monkeypatch.setattr(settings, "web_push_vapid_subject", "mailto:test@example.com")

    class _Response:
        status_code = 410
        text = "gone"

    class _GonePushError(Exception):
        def __init__(self) -> None:
            super().__init__("gone")
            self.response = _Response()

    def _raise_gone(*args, **kwargs):
        raise _GonePushError()

    monkeypatch.setattr(push_service, "WebPushException", _GonePushError)
    monkeypatch.setattr(push_service, "webpush", _raise_gone)

    with SessionLocal() as db:
        user = User(email="push-user-gone@example.com", hashed_password="x", name="Push User")
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add(
            PushSubscription(
                user_id=user.id,
                endpoint="https://web.push.apple.com/test-endpoint-gone",
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


def test_send_push_uses_fresh_vapid_claims_per_endpoint(monkeypatch) -> None:
    monkeypatch.setattr(
        settings,
        "web_push_vapid_public_key",
        "BMzfyxQN9W_qHDMQDdoTx9Cqn1YEQXWRHiEjzrXm4ZUd4yAuFDjYWUWFm8oDrkEHPCq_3B6AHjGCZdyAM1EEqhI",
    )
    monkeypatch.setattr(settings, "web_push_vapid_private_key", "dummy-private-key")
    monkeypatch.setattr(settings, "web_push_vapid_subject", "mailto:test@example.com")

    class _Response:
        status_code = 403
        text = '{"reason":"BadJwtToken"}'

    class _BadJwtPushError(Exception):
        def __init__(self) -> None:
            super().__init__("bad jwt")
            self.response = _Response()

    call_count = 0

    def _fake_webpush(*, subscription_info, vapid_claims, **kwargs):
        nonlocal call_count
        call_count += 1
        expected_aud = f"https://{urlparse(subscription_info['endpoint']).netloc}"
        existing_aud = vapid_claims.get("aud")
        if existing_aud and existing_aud != expected_aud:
            raise _BadJwtPushError()
        # Mimic pywebpush mutating claims by persisting endpoint-specific audience.
        vapid_claims["aud"] = expected_aud

    monkeypatch.setattr(push_service, "WebPushException", _BadJwtPushError)
    monkeypatch.setattr(push_service, "webpush", _fake_webpush)

    with SessionLocal() as db:
        user = User(email="push-user-aud@example.com", hashed_password="x", name="Push User")
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add_all(
            [
                PushSubscription(
                    user_id=user.id,
                    endpoint="https://fcm.googleapis.com/fcm/send/test-fcm",
                    p256dh="test-p256dh-1",
                    auth="test-auth-1",
                ),
                PushSubscription(
                    user_id=user.id,
                    endpoint="https://web.push.apple.com/test-apple",
                    p256dh="test-p256dh-2",
                    auth="test-auth-2",
                ),
            ]
        )
        db.commit()

        sent = push_service.send_push_to_user(
            db,
            user,
            title="Test",
            body="Body",
        )

        assert sent == 2
        assert call_count == 2


def test_send_push_can_ignore_push_toggle_for_explicit_alert(monkeypatch) -> None:
    monkeypatch.setattr(
        settings,
        "web_push_vapid_public_key",
        "BMzfyxQN9W_qHDMQDdoTx9Cqn1YEQXWRHiEjzrXm4ZUd4yAuFDjYWUWFm8oDrkEHPCq_3B6AHjGCZdyAM1EEqhI",
    )
    monkeypatch.setattr(settings, "web_push_vapid_private_key", "dummy-private-key")
    monkeypatch.setattr(settings, "web_push_vapid_subject", "mailto:test@example.com")

    calls = {"count": 0}

    def _fake_webpush(*args, **kwargs):
        calls["count"] += 1

    monkeypatch.setattr(push_service, "webpush", _fake_webpush)
    monkeypatch.setattr(
        push_service.settings_service,
        "get_user_settings_row",
        lambda db, user: SimpleNamespace(
            notifications_enabled=True,
            push_notifications_enabled=False,
        ),
    )

    with SessionLocal() as db:
        user = User(email="push-user-ignore-toggle@example.com", hashed_password="x", name="Push User")
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add(
            PushSubscription(
                user_id=user.id,
                endpoint="https://fcm.googleapis.com/fcm/send/test-ignore-toggle",
                p256dh="test-p256dh",
                auth="test-auth",
            )
        )
        db.commit()

        sent_default = push_service.send_push_to_user(
            db,
            user,
            title="Test",
            body="Body",
        )
        assert sent_default == 0

        sent_override = push_service.send_push_to_user(
            db,
            user,
            title="Test",
            body="Body",
            ignore_push_enabled=True,
        )
        assert sent_override == 1
        assert calls["count"] == 1
