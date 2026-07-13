"use client";

import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import {
  useCreateContacto,
  useDeleteContacto,
  useUpdateContacto,
} from "@/lib/clientes";
import type { Contacto, ContactoCreate, RolCompra } from "@/lib/types";

const ROLES: RolCompra[] = ["decisor", "tecnico", "compras", "logistica", "otro"];

interface Props {
  clienteId: number;
  contactos: Contacto[];
}

export function ContactosSection({ clienteId, contactos }: Props) {
  const [editing, setEditing] = useState<Contacto | null>(null);
  const [creating, setCreating] = useState(false);

  const createMut = useCreateContacto(clienteId);
  const updateMut = useUpdateContacto(clienteId);
  const deleteMut = useDeleteContacto(clienteId);

  const closeModal = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleSubmit = (values: ContactoCreate) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, body: values }, { onSuccess: closeModal });
    } else {
      createMut.mutate(values, { onSuccess: closeModal });
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Contactos</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus size={16} /> Agregar
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Teléfono</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {contactos.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-800 dark:text-slate-100">
                    {c.es_principal && <Star size={14} className="text-amber-500" fill="currentColor" />}
                    {c.nombre}
                  </span>
                  {c.cargo && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">· {c.cargo}</span>}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{c.email ?? "—"}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{c.telefono ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge>{c.rol_compra}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <Tooltip label="Editar">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(c)} aria-label="Editar">
                      <Pencil size={15} />
                    </Button>
                  </Tooltip>
                  <Tooltip label="Eliminar">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`¿Eliminar el contacto "${c.nombre}"?`)) deleteMut.mutate(c.id);
                      }}
                      aria-label="Eliminar"
                    >
                      <Trash2 size={15} className="text-red-500" />
                    </Button>
                  </Tooltip>
                </td>
              </tr>
            ))}
            {contactos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400 dark:text-slate-500">
                  Sin contactos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={creating || editing !== null}
        onClose={closeModal}
        title={editing ? "Editar contacto" : "Nuevo contacto"}
      >
        <ContactoForm
          key={editing?.id ?? "new"}
          initial={editing ?? undefined}
          isPending={createMut.isPending || updateMut.isPending}
          onSubmit={handleSubmit}
          onCancel={closeModal}
        />
      </Modal>
    </section>
  );
}

interface ContactoFormProps {
  initial?: Contacto;
  isPending: boolean;
  onSubmit: (values: ContactoCreate) => void;
  onCancel: () => void;
}

function ContactoForm({ initial, isPending, onSubmit, onCancel }: ContactoFormProps) {
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [cargo, setCargo] = useState(initial?.cargo ?? "");
  const [rol, setRol] = useState<RolCompra>(initial?.rol_compra ?? "otro");
  const [esPrincipal, setEsPrincipal] = useState(initial?.es_principal ?? false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    onSubmit({
      nombre: nombre.trim(),
      email: email.trim() || null,
      telefono: telefono.trim() || null,
      cargo: cargo.trim() || null,
      rol_compra: rol,
      es_principal: esPrincipal,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="c-nombre">Nombre *</Label>
        <Input id="c-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="c-email">Email</Label>
          <Input
            id="c-email"
            type="email"
            value={email ?? ""}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="c-tel">Teléfono</Label>
          <Input id="c-tel" value={telefono ?? ""} onChange={(e) => setTelefono(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="c-cargo">Cargo</Label>
          <Input id="c-cargo" value={cargo ?? ""} onChange={(e) => setCargo(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="c-rol">Rol de compra</Label>
          <Select id="c-rol" value={rol} onChange={(e) => setRol(e.target.value as RolCompra)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={esPrincipal}
          onChange={(e) => setEsPrincipal(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
        />
        Contacto principal
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || !nombre.trim()}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
