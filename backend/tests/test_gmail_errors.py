"""Tests del clasificador de errores de Gmail."""

from googleapiclient.errors import HttpError

from app.integrations.gmail.errors import clasificar_error_gmail


class _Resp:
    def __init__(self, status: int) -> None:
        self.status = status
        self.reason = "Error"


def _http(status: int, content: str) -> HttpError:
    return HttpError(_Resp(status), content.encode())


def test_rate_limit_da_503() -> None:
    contenido = '{"error":{"message":"Quota exceeded","errors":[{"reason":"rateLimitExceeded"}]}}'
    code, msg = clasificar_error_gmail(_http(403, contenido))
    assert code == 503
    assert "minuto" in msg.lower()


def test_429_da_503() -> None:
    code, _ = clasificar_error_gmail(_http(429, '{"error":{"message":"too many"}}'))
    assert code == 503


def test_token_invalido_da_401() -> None:
    code, msg = clasificar_error_gmail(Exception("invalid_grant: Token has been expired"))
    assert code == 401
    assert "gmail" in msg.lower()


def test_permisos_da_403() -> None:
    err = _http(403, '{"error":{"message":"Request had insufficient authentication scopes"}}')
    code, _ = clasificar_error_gmail(err)
    assert code == 403


def test_otro_error_da_502() -> None:
    code, _ = clasificar_error_gmail(RuntimeError("algo raro"))
    assert code == 502
