"use client";

import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kicker } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { SelectMenu } from "@/components/ui/select-menu";
import { Switch } from "@/components/ui/switch";
import {
  useCreateUsuario,
  useDeleteUsuario,
  useUpdateUsuario,
  useUsuarios,
} from "@/lib/usuarios";
import type { RolUsuario, Usuario } from "@/lib/types";
import { errorMessage as errorDetail } from "@/lib/utils";

const ROLES: { value: RolUsuario; label: string }[] = [
  { value: "vendedor", label: "Vendedor" },
  { value: "admin", label: "Admin" },
  { value: "compras", label: "Compras" },
];
const ROL_LABEL: Record<RolUsuario, string> = {
  vendedor: "Vendedor",
  admin: "Admin",
  compras: "Compras",
};

export default function UsuariosPage() {
  const { data: session } = useSession();
  const esAdmin = (session?.usuario as { rol?: string } | undefined)?.rol === "admin";

  const { data, isLoading } = useUsuarios();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const deleteMut = useDeleteUsuario();
  const confirm = useConfirm();

  if (!esAdmin) {
    return (
      <div>
        <Kicker>Equipo</Kicker>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Usuarios</h1>
        <p className="mt-4 text-ink-2">
          Solo un administrador puede gestionar usuarios.
        </p>
      </div>
    );
  }

  const eliminar = async (u: Usuario) => {
    if (!(await confirm({ title: "Eliminar usuario", message: `¿Eliminar a ${u.nombre} (${u.email})?`, danger: true }))) return;
    deleteMut.mutate(u.id, {
      onError: (err) =>
        window.alert(
          errorDetail(err, "No se pudo eliminar. Si tiene historial, desactivalo en su lugar.")
        ),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Kicker>Equipo</Kicker>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Usuarios</h1>
          <p className="mt-1 text-sm text-ink-2">
            Autorizá vendedores para que puedan iniciar sesión y conectar su Gmail.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nuevo usuario
        </Button>
      </div>

      {isLoading && <p className="mt-4 text-ink-2">Cargando…</p>}

      {data && (
        <div className="mt-6 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-left text-ink-2">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-2 font-medium text-ink">
                    {u.nombre}
                  </td>
                  <td className="px-4 py-2 text-ink-2">{u.email}</td>
                  <td className="px-4 py-2">
                    <Badge>{ROL_LABEL[u.rol]}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.activo ? (
                        <Badge tone="success">Activo</Badge>
                      ) : (
                        <Badge>Inactivo</Badge>
                      )}
                      {u.gmail_conectado && (
                        <Badge tone="info">Gmail ✓</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Tooltip label="Ver perfil">
                      <Link
                        href={`/usuarios/${u.id}`}
                        aria-label="Ver perfil"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-all hover:bg-surface2"
                      >
                        <Eye size={15} />
                      </Link>
                    </Tooltip>
                    <Tooltip label="Editar">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(u)} aria-label="Editar">
                        <Pencil size={15} />
                      </Button>
                    </Tooltip>
                    <Tooltip label="Eliminar">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => eliminar(u)}
                        disabled={deleteMut.isPending}
                        aria-label="Eliminar"
                        className="text-ink-3 hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </Tooltip>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                    No hay usuarios todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateModal onClose={() => setCreating(false)} />}
      {editing && <EditModal usuario={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const createMut = useCreateUsuario();
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<RolUsuario>("vendedor");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !nombre.trim()) return;
    createMut.mutate(
      { email: email.trim(), nombre: nombre.trim(), rol },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal open onClose={onClose} title="Nuevo usuario">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="u-email">Email (de Google) *</Label>
          <Input
            id="u-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@argentinacolor.com"
            required
          />
        </div>
        <div>
          <Label htmlFor="u-nombre">Nombre *</Label>
          <Input id="u-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="u-rol">Rol</Label>
          <SelectMenu
            id="u-rol"
            value={rol}
            onChange={(v) => setRol(v as RolUsuario)}
            options={ROLES}
          />
        </div>
        {createMut.isError && (
          <p className="text-sm text-danger">
            {errorDetail(createMut.error, "No se pudo crear el usuario.")}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={createMut.isPending}>
            {createMut.isPending ? "Creando…" : "Crear"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditModal({ usuario, onClose }: { usuario: Usuario; onClose: () => void }) {
  const updateMut = useUpdateUsuario(usuario.id);
  const [nombre, setNombre] = useState(usuario.nombre);
  const [rol, setRol] = useState<RolUsuario>(usuario.rol);
  const [activo, setActivo] = useState(usuario.activo);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    updateMut.mutate({ nombre: nombre.trim(), rol, activo }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} title={`Editar ${usuario.email}`}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="e-nombre">Nombre</Label>
          <Input id="e-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="e-rol">Rol</Label>
          <SelectMenu
            id="e-rol"
            value={rol}
            onChange={(v) => setRol(v as RolUsuario)}
            options={ROLES}
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Switch checked={activo} onCheckedChange={setActivo} id="e-activo" />
          <Label htmlFor="e-activo" className="mb-0">
            {activo ? "Activo (puede iniciar sesión)" : "Inactivo (login bloqueado)"}
          </Label>
        </div>
        {updateMut.isError && (
          <p className="text-sm text-danger">
            {errorDetail(updateMut.error, "No se pudo guardar.")}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={updateMut.isPending}>
            {updateMut.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
