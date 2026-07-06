"""One-off: re-trae el cuerpo original de cada mail desde Gmail y lo re-parsea
con el parser actual (maneja bien HTML y deja intacto el texto plano).

Repara tanto los mails que quedaron con HTML crudo como los que un script
anterior tocó de más. Usa el token del vendedor conectado para leer su casilla.

Uso:  python -m scripts.reparar_cuerpos
"""

from sqlalchemy import select

from app.core.crypto import decrypt
from app.db.models.mails import DireccionMail, Mail
from app.db.models.usuarios import Usuario
from app.db.session import SessionLocal
from app.integrations.gmail.client import GmailClient


def main() -> None:
    db = SessionLocal()
    try:
        # Un cliente de Gmail por cada vendedor conectado (para leer su casilla).
        clientes: dict[int, GmailClient] = {}
        for u in db.scalars(
            select(Usuario).where(Usuario.gmail_refresh_token.is_not(None))
        ):
            tok = decrypt(u.gmail_refresh_token)
            if tok:
                clientes[u.id] = GmailClient(refresh_token=tok)
        if not clientes:
            print("No hay vendedores con Gmail conectado; nada que reparar.")
            return

        mails = list(
            db.scalars(
                select(Mail).where(
                    Mail.direccion == DireccionMail.entrante,
                    Mail.gmail_message_id.is_not(None),
                )
            )
        )
        reparados, fallidos = 0, 0
        for m in mails:
            ok = False
            for gmail in clientes.values():
                try:
                    msg = gmail.get_message(m.gmail_message_id)
                    if msg.get("cuerpo"):
                        m.cuerpo = msg["cuerpo"]
                        reparados += 1
                        ok = True
                        break
                except Exception:  # noqa: BLE001 - el mensaje puede no estar en esa casilla
                    continue
            if not ok:
                fallidos += 1
        db.commit()
        print(f"Cuerpos reparados: {reparados} | no encontrados: {fallidos} | total: {len(mails)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
