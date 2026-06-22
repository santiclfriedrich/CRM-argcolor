"""Seed inicial: da de alta un usuario en la tabla usuarios.

Uso:
    python -m scripts.seed_user "email@dominio.com" "Nombre Apellido" admin

Si no se pasan argumentos, usa valores por defecto (el admin del proyecto).
La API valida el login contra esta tabla (whitelist), por eso hay que
crear al menos un usuario antes de poder iniciar sesión.
"""

import sys

from sqlalchemy import select

from app.db.models.usuarios import RolUsuario, Usuario
from app.db.session import SessionLocal


def seed_user(email: str, nombre: str, rol: str) -> None:
    db = SessionLocal()
    try:
        existing = db.scalar(select(Usuario).where(Usuario.email == email))
        if existing:
            print(f"El usuario {email} ya existe (id={existing.id}). Nada que hacer.")
            return

        usuario = Usuario(
            email=email,
            nombre=nombre,
            rol=RolUsuario(rol),
            activo=True,
        )
        db.add(usuario)
        db.commit()
        db.refresh(usuario)
        print(f"Usuario creado: id={usuario.id}, email={usuario.email}, rol={usuario.rol.value}")
    finally:
        db.close()


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "santiago.c@argentinacolor.com"
    nombre = sys.argv[2] if len(sys.argv) > 2 else "Santiago Claros Friedrich"
    rol = sys.argv[3] if len(sys.argv) > 3 else "admin"
    seed_user(email, nombre, rol)
