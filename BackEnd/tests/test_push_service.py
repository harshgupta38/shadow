"""Web push service key normalization tests."""

from __future__ import annotations

import base64

from app.constant import settings
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
