"use client";

import { FileText } from "lucide-react";
import {
  useEffect,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { ClientePicker } from "@/components/clientes/cliente-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import { imagenesPegadas, sumarSinDuplicados, useImagePreviews } from "@/lib/attachments";
import { useClientes } from "@/lib/clientes";
import { useGruposCompras, useSpeeches } from "@/lib/config";
import { useOportunidades } from "@/lib/oportunidades";
import { CONDICIONES_PAGO } from "@/lib/solicitudes";
import type { CondicionPago, SolicitudCreate } from "@/lib/types";

interface Props {
  isPending: boolean;
  onSubmit: (values: SolicitudCreate, files: File[]) => void;
  onCancel: () => void;
  // Pre-carga (ej. desde una oportunidad, con el requerimiento ya extraído por IA).
  defaultOportunidadId?: number | null;
  defaultRequerimiento?: string;
  // Si la oportunidad viene fijada, no se puede cambiar en el form.
  lockOportunidad?: boolean;
  // Textos del botón de submit (ej. "Enviar a Compras" cuando además se envía).
  submitLabel?: string;
  pendingLabel?: string;
  // Contenido extra debajo del input de adjuntos (ej. archivos de la oportunidad).
  adjuntosExtra?: ReactNode;
}

// "a@x.com, b@y.com" -> ["a@x.com", "b@y.com"]
const parseEmails = (raw: string): string[] =>
  raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

export function SolicitudForm({
  isPending,
  onSubmit,
  onCancel,
  defaultOportunidadId = null,
  defaultRequerimiento = "",
  lockOportunidad = false,
  submitLabel = "Crear solicitud",
  pendingLabel = "Creando…",
  adjuntosExtra,
}: Props) {
  const { data: oportunidades } = useOportunidades();
  const { data: clientes } = useClientes();
  const { data: grupos } = useGruposCompras();
  const { data: speeches } = useSpeeches();

  const [oportunidadId, setOportunidadId] = useState<number | null>(defaultOportunidadId);
  // Búsqueda en 2 pasos (solo alta manual): primero el cliente, luego una de sus
  // oportunidades. Si la oportunidad viene fijada, no se usa.
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [requerimiento, setRequerimiento] = useState(defaultRequerimiento);
  const [condicionPago, setCondicionPago] = useState<CondicionPago | "">("");
  const [importe, setImporte] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [refGbp, setRefGbp] = useState("");
  const [ccs, setCcs] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [grupoId, setGrupoId] = useState<number | null>(null);

  // Preseleccionar el grupo default del usuario cuando cargan los grupos.
  useEffect(() => {
    if (grupoId != null || !grupos?.length) return;
    setGrupoId((grupos.find((g) => g.es_default) ?? grupos[0]).id);
  }, [grupos, grupoId]);

  const agregarFiles = (nuevos: File[]) =>
    setFiles((prev) => sumarSinDuplicados(prev, nuevos));

  // Pegar imagen del portapapeles (Ctrl/Cmd+V): se adjunta como un archivo más.
  const onPasteImagen = (e: ClipboardEvent<HTMLFormElement>) => {
    const imgs = imagenesPegadas(e);
    if (imgs.length > 0) {
      e.preventDefault(); // que no intente pegar la imagen dentro del textarea
      agregarFiles(imgs);
    }
  };

  const previews = useImagePreviews(files);

  // Oportunidades del cliente elegido (para el segundo paso del buscador).
  const opsDelCliente = (oportunidades ?? []).filter(
    (o) => clienteId != null && o.cliente?.id === clienteId
  );

  // El N° de cliente sale de la cuenta ya vinculada a la oportunidad; no se
  // vuelve a cargar a mano.
  const oportunidadSel = oportunidades?.find((o) => o.id === oportunidadId);
  const numeroCliente = oportunidadSel?.cliente?.numero_cliente ?? "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!oportunidadId || !requerimiento.trim()) return;
    onSubmit(
      {
        oportunidad_id: oportunidadId,
        requerimiento: requerimiento.trim(),
        numero_cliente: numeroCliente.trim() || null,
        condicion_pago: condicionPago || null,
        importe_aproximado: importe ? Number(importe) : null,
        fecha_limite: fechaLimite || null,
        presupuesto_gbp_referencia: refGbp.trim() || null,
        ccs_extra: parseEmails(ccs),
        grupo_compras_id: grupoId,
      },
      files
    );
  };

  return (
    <form onSubmit={submit} onPaste={onPasteImagen} className="space-y-4">
      {lockOportunidad ? (
        <div>
          <Label htmlFor="s-op">Oportunidad *</Label>
          <SelectMenu
            id="s-op"
            value={oportunidadId != null ? String(oportunidadId) : ""}
            onChange={(v) => setOportunidadId(v ? Number(v) : null)}
            disabled
            placeholder="— Elegí una oportunidad —"
            options={[
              { value: "", label: "— Elegí una oportunidad —" },
              ...(oportunidades ?? []).map((o) => ({
                value: String(o.id),
                label: `#${o.id} — ${o.cliente?.razon_social ?? "Sin cliente"}`,
              })),
            ]}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-cli">Cliente *</Label>
            <ClientePicker
              clientes={clientes ?? []}
              value={clienteId}
              onChange={(id) => {
                setClienteId(id);
                setOportunidadId(null); // la oportunidad depende del cliente
              }}
            />
          </div>
          <div>
            <Label htmlFor="s-op">Oportunidad *</Label>
            <SelectMenu
              id="s-op"
              value={oportunidadId != null ? String(oportunidadId) : ""}
              onChange={(v) => setOportunidadId(v ? Number(v) : null)}
              disabled={clienteId == null}
              placeholder={
                clienteId == null
                  ? "Elegí un cliente primero"
                  : opsDelCliente.length === 0
                    ? "Este cliente no tiene oportunidades"
                    : "— Elegí una oportunidad —"
              }
              options={[
                { value: "", label: "— Elegí una oportunidad —" },
                ...opsDelCliente.map((o) => ({
                  value: String(o.id),
                  label: `#${o.id} — ${o.asunto ?? "Sin asunto"}`,
                })),
              ]}
            />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="s-numcli">Número de cliente</Label>
        <Input
          id="s-numcli"
          value={numeroCliente}
          readOnly
          disabled
          placeholder="—"
          className="font-mono tabular-nums"
        />
        <p className="mt-1 text-xs text-ink-3">
          {!oportunidadId
            ? "Se toma de la cuenta al elegir la oportunidad."
            : numeroCliente
              ? "Tomado de la cuenta vinculada a la oportunidad."
              : "La cuenta de esta oportunidad no tiene N° de cliente cargado."}
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Label htmlFor="s-req">Requerimiento *</Label>
          {speeches && speeches.length > 0 && (
            <div className="w-56">
              <SelectMenu
                id="s-speech"
                value=""
                onChange={(v) => {
                  const sp = speeches.find((s) => String(s.id) === v);
                  // El speech va ANTES del requerimiento (no lo pisa): se
                  // antepone y lo ya escrito queda debajo, en el mismo cuerpo.
                  if (sp) {
                    setRequerimiento((prev) =>
                      prev.trim() ? `${sp.texto}\n\n${prev}` : sp.texto
                    );
                  }
                }}
                placeholder="Usar un speech…"
                options={[
                  { value: "", label: "Usar un speech…" },
                  ...speeches.map((s) => ({ value: String(s.id), label: s.titulo })),
                ]}
              />
            </div>
          )}
        </div>
        <Textarea
          id="s-req"
          rows={4}
          value={requerimiento}
          onChange={(e) => setRequerimiento(e.target.value)}
          placeholder="Detalle de lo que se necesita cotizar…"
          required
        />
        <p className="mt-1 text-xs text-ink-3">
          Podés pegar una imagen (Ctrl/Cmd+V) y se adjunta al pedido; se envía a
          Compras junto con la solicitud.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="s-cond">Condición de pago</Label>
          <SelectMenu
            id="s-cond"
            value={condicionPago}
            onChange={(v) => setCondicionPago(v as CondicionPago | "")}
            placeholder="— Sin especificar —"
            options={[
              { value: "", label: "— Sin especificar —" },
              ...CONDICIONES_PAGO.map((c) => ({
                value: c,
                // A los numéricos ("15", "30"…) se les agrega "días"; el resto
                // ya trae su texto completo.
                label: /^\d+$/.test(c) ? `${c} días` : c,
              })),
            ]}
          />
        </div>
        <div>
          <Label htmlFor="s-importe">Importe aproximado (USD)</Label>
          <Input
            id="s-importe"
            type="number"
            min="0"
            step="0.01"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            className="tabular-nums"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="s-fecha">Fecha límite</Label>
          <Input
            id="s-fecha"
            type="date"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="s-gbp">Referencia GBP (opcional)</Label>
          <Input id="s-gbp" value={refGbp} onChange={(e) => setRefGbp(e.target.value)} />
        </div>
      </div>

      <div>
        <Label htmlFor="s-grupo">Enviar a (grupo de Compras)</Label>
        {grupos && grupos.length > 0 ? (
          <SelectMenu
            id="s-grupo"
            value={grupoId != null ? String(grupoId) : ""}
            onChange={(v) => setGrupoId(v ? Number(v) : null)}
            options={grupos.map((g) => ({
              value: String(g.id),
              label: `${g.nombre}${g.es_default ? " (por defecto)" : ""} — ${g.to}`,
            }))}
          />
        ) : (
          <p className="text-sm text-ink-3">
            No tenés grupos de Compras. Se usará el destinatario general. Podés
            crear grupos en Configuración.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="s-ccs">CC extra (emails separados por coma)</Label>
        <Input
          id="s-ccs"
          value={ccs}
          onChange={(e) => setCcs(e.target.value)}
          placeholder="persona@cliente.com, otra@cliente.com"
        />
      </div>

      <div>
        <Label htmlFor="s-files">
          Adjuntos (PDF, imágenes, Excel, Word o CSV — también podés pegar una captura)
        </Label>
        <input
          id="s-files"
          type="file"
          multiple
          accept=".pdf,image/*,.csv,.xls,.xlsx,.doc,.docx"
          onChange={(e) => {
            agregarFiles(Array.from(e.target.files ?? []));
            // Limpiamos el input para poder volver a elegir el mismo archivo.
            e.target.value = "";
          }}
          className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface2 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface3"
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md bg-surface2 px-2.5 py-1.5 text-xs text-ink-2"
              >
                {previews[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews[i] as string}
                    alt={f.name}
                    className="h-9 w-9 shrink-0 rounded object-cover ring-1 ring-line"
                  />
                ) : (
                  <FileText size={16} className="shrink-0 text-ink-3" />
                )}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="shrink-0 text-ink-3 transition-colors hover:text-danger"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        {adjuntosExtra}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || !oportunidadId || !requerimiento.trim()}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
