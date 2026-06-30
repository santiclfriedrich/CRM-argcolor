"""Tests del cifrado de secretos (refresh tokens de Gmail)."""

from app.core.crypto import decrypt, encrypt


def test_encrypt_decrypt_round_trip() -> None:
    secreto = "1//0hEVVTMB32NjjCgYIARAAGBESNwF-token-de-prueba"
    cifrado = encrypt(secreto)
    assert cifrado != secreto  # no queda en texto plano
    assert decrypt(cifrado) == secreto


def test_decrypt_invalido_devuelve_none() -> None:
    assert decrypt("no-es-un-token-valido") is None
    assert decrypt(None) is None
    assert decrypt("") is None
