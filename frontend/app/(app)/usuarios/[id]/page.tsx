"use client";

import {
  ArrowLeft,
  Building2,
  CalendarClock,
  DollarSign,
  Hash,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { Badge } from "@/components/ui/badge";
import { RefChip } from "@/components/ui/ref-chip";
import { ESTADO_META, useOportunidades } from "@/lib/oportunidades";
import { ESTADO_PRESUPUESTO, fmtMonto, usePresupuestos } from "@/lib/presupuestos";
import { ESTADO_SOLICITUD_META, useSolicitudes } from "@/lib/solicitudes";
import { useUsuario } from "@/lib/usuarios";

// "2026-08-01T..." -> "01/08/2026" (sin líos de zona horaria).
function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

// Referencia a la cuenta relacionada (columna "Cliente" de las sub-tablas).
function ClienteRef({ nombre }: { nombre?: string | null }) {
  if (!nombre) return <span className="text-ink-3">—</span>;
  return (
    <RefChip icon={<Building2 size={12} className="shrink-0 text-ink-3" />}>{nombre}</RefChip>
  );
}

// Iconito de tipo por cabecera (Pipedrive-style) para las columnas clave.
const CABECERA_ICONO: Record<string, LucideIcon> = {
  Cliente: Building2,
  Asunto: Target,
  "Últ. mov.": CalendarClock,
  Enviada: CalendarClock,
  Código: Hash,
  Monto: DollarSign,
};

export default function PerfilUsuarioPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data: session } = useSession();
  const esAdmin = String(session?.usuario?.rol ?? "") === "admin";

  const { data: usuario } = useUsuario(id);
  const oportunidades = useOportunidades({ usuario_id: id });
  const presupuestos = usePresupuestos(undefined, id);
  const solicitudes = useSolicitudes(id);

  if (!esAdmin) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-danger">Solo un administrador puede ver el perfil de otro usuario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          {usuario?.nombre ?? "Cargando…"}
        </h1>
        {usuario && (
          <p className="text-sm text-ink-2">
            {usuario.email} · {usuario.rol}
          </p>
        )}
      </div>

      <Section
        titulo="Oportunidades"
        total={oportunidades.data?.length}
        isLoading={oportunidades.isLoading}
        vacio="Sin oportunidades."
        cabeceras={["Cliente", "Asunto", "Estado", "Últ. mov."]}
        filas={(oportunidades.data ?? []).map((o) => [
          <ClienteRef key="c" nombre={o.cliente?.razon_social} />,
          o.asunto ?? "—",
          <Badge key="e" className={ESTADO_META[o.estado].color}>{ESTADO_META[o.estado].label}</Badge>,
          <span key="m" className="font-mono tabular-nums">{fmtDate(o.fecha_ultimo_movimiento)}</span>,
        ])}
      />

      <Section
        titulo="Solicitudes a Compras"
        total={solicitudes.data?.length}
        isLoading={solicitudes.isLoading}
        vacio="Sin solicitudes."
        cabeceras={["Cliente", "Requerimiento", "Estado", "Enviada"]}
        filas={(solicitudes.data ?? []).map((s) => [
          <ClienteRef key="c" nombre={s.oportunidad?.cliente?.razon_social} />,
          <span key="r" className="line-clamp-1">{s.requerimiento}</span>,
          <Badge key="e" className={ESTADO_SOLICITUD_META[s.estado].color}>
            {ESTADO_SOLICITUD_META[s.estado].label}
          </Badge>,
          <span key="d" className="font-mono tabular-nums">{fmtDate(s.fecha_envio ?? s.created_at)}</span>,
        ])}
      />

      <Section
        titulo="Presupuestos"
        total={presupuestos.data?.length}
        isLoading={presupuestos.isLoading}
        vacio="Sin presupuestos."
        cabeceras={["Código", "Cliente", "Monto", "Estado"]}
        filas={(presupuestos.data ?? []).map((p) => [
          <Link key="c" href={`/presupuestos/${p.id}`} className="font-mono tabular-nums font-medium text-accent hover:underline">
            {p.codigo}
          </Link>,
          <ClienteRef key="cl" nombre={p.oportunidad?.cliente?.razon_social} />,
          <span key="m" className="font-mono tabular-nums">{fmtMonto(p.monto_total, p.moneda)}</span>,
          <Badge key="e" className={ESTADO_PRESUPUESTO[p.estado].color}>
            {ESTADO_PRESUPUESTO[p.estado].label}
          </Badge>,
        ])}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/usuarios"
      className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
    >
      <ArrowLeft size={15} /> Usuarios
    </Link>
  );
}

function Section({
  titulo,
  total,
  isLoading,
  vacio,
  cabeceras,
  filas,
}: {
  titulo: string;
  total?: number;
  isLoading: boolean;
  vacio: string;
  cabeceras: string[];
  filas: React.ReactNode[][];
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-base font-semibold tracking-tight text-ink">{titulo}</h2>
        {total != null && (
          <Badge className="font-mono tabular-nums">{total}</Badge>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line [&_th]:bg-surface2 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-ink-2">
              {cabeceras.map((c) => {
                const Icono = CABECERA_ICONO[c];
                return (
                  <th key={c}>
                    {Icono ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Icono size={13} className="text-ink-3" /> {c}
                      </span>
                    ) : (
                      c
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={cabeceras.length} className="px-4 py-6 text-center text-ink-3">
                  Cargando…
                </td>
              </tr>
            ) : filas.length === 0 ? (
              <tr>
                <td colSpan={cabeceras.length} className="px-4 py-6 text-center text-ink-3">
                  {vacio}
                </td>
              </tr>
            ) : (
              filas.map((fila, i) => (
                <tr key={i} className="border-t border-line transition-colors hover:bg-surface2">
                  {fila.map((celda, j) => (
                    <td key={j} className="px-4 py-3 text-ink-2">{celda}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
