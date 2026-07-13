// Registros recientes: unifica cuentas, oportunidades y presupuestos por fecha
// de último movimiento/creación. Aproxima el "recientes" de Salesforce con los
// datos que ya tenemos (no trackeamos "vistos", usamos actividad/creación).
import { useMemo } from "react";

import { useClientes } from "@/lib/clientes";
import { useOportunidades } from "@/lib/oportunidades";
import { usePresupuestos } from "@/lib/presupuestos";

export type TipoRegistro = "Cuenta" | "Oportunidad" | "Presupuesto";

export interface RegistroReciente {
  key: string;
  nombre: string;
  tipo: TipoRegistro;
  fecha: string;
  href: string;
}

export function useRegistrosRecientes(limit = 30): {
  data: RegistroReciente[];
  isLoading: boolean;
} {
  const opps = useOportunidades();
  const clientes = useClientes();
  const presupuestos = usePresupuestos();

  const data = useMemo(() => {
    const items: RegistroReciente[] = [];

    for (const o of opps.data ?? []) {
      items.push({
        key: `o-${o.id}`,
        nombre: o.cliente?.razon_social ?? o.asunto ?? `Oportunidad #${o.id}`,
        tipo: "Oportunidad",
        fecha: o.fecha_ultimo_movimiento,
        href: `/oportunidades?op=${o.id}`,
      });
    }
    for (const c of clientes.data ?? []) {
      items.push({
        key: `c-${c.id}`,
        nombre: c.razon_social,
        tipo: "Cuenta",
        fecha: c.created_at,
        href: `/clientes/${c.id}`,
      });
    }
    for (const p of presupuestos.data ?? []) {
      const cliente = p.oportunidad?.cliente?.razon_social;
      items.push({
        key: `p-${p.id}`,
        nombre: cliente ? `${p.codigo} · ${cliente}` : p.codigo,
        tipo: "Presupuesto",
        fecha: p.created_at,
        href: `/presupuestos/${p.id}`,
      });
    }

    items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    return items.slice(0, limit);
  }, [opps.data, clientes.data, presupuestos.data, limit]);

  return { data, isLoading: opps.isLoading || clientes.isLoading || presupuestos.isLoading };
}
