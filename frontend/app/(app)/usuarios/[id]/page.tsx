"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";

import { Badge } from "@/components/ui/badge";
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
        <p className="text-red-600">Solo un administrador puede ver el perfil de otro usuario.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <div>
        <h1 className="text-2xl font-bold text-ink">
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
          o.cliente?.razon_social ?? "—",
          o.asunto ?? "—",
          <Badge key="e" className={ESTADO_META[o.estado].color}>{ESTADO_META[o.estado].label}</Badge>,
          fmtDate(o.fecha_ultimo_movimiento),
        ])}
      />

      <Section
        titulo="Solicitudes a Compras"
        total={solicitudes.data?.length}
        isLoading={solicitudes.isLoading}
        vacio="Sin solicitudes."
        cabeceras={["Cliente", "Requerimiento", "Estado", "Enviada"]}
        filas={(solicitudes.data ?? []).map((s) => [
          s.oportunidad?.cliente?.razon_social ?? "—",
          <span key="r" className="line-clamp-1">{s.requerimiento}</span>,
          <Badge key="e" className={ESTADO_SOLICITUD_META[s.estado].color}>
            {ESTADO_SOLICITUD_META[s.estado].label}
          </Badge>,
          fmtDate(s.fecha_envio ?? s.created_at),
        ])}
      />

      <Section
        titulo="Presupuestos"
        total={presupuestos.data?.length}
        isLoading={presupuestos.isLoading}
        vacio="Sin presupuestos."
        cabeceras={["Código", "Cliente", "Monto", "Estado"]}
        filas={(presupuestos.data ?? []).map((p) => [
          <Link key="c" href={`/presupuestos/${p.id}`} className="font-medium text-accent hover:underline">
            {p.codigo}
          </Link>,
          p.oportunidad?.cliente?.razon_social ?? "—",
          fmtMonto(p.monto_total, p.moneda),
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
        <h2 className="text-lg font-semibold text-ink">{titulo}</h2>
        {total != null && (
          <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-medium text-ink-2">
            {total}
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-left text-xs uppercase text-ink-2">
            <tr>
              {cabeceras.map((c) => (
                <th key={c} className="px-4 py-2 font-medium">{c}</th>
              ))}
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
                <tr key={i} className="border-t border-line">
                  {fila.map((celda, j) => (
                    <td key={j} className="px-4 py-2 text-ink-2">{celda}</td>
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
