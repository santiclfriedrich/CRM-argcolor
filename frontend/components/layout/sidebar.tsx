"use client";

import {
  LayoutDashboard,
  Target,
  Building2,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/oportunidades", label: "Oportunidades", icon: Target },
  { href: "/clientes", label: "Clientes", icon: Building2 },
  { href: "/presupuestos", label: "Presupuestos", icon: FileText },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const nombre = (session?.usuario?.nombre as string) ?? session?.user?.name ?? "Usuario";

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-6 py-5 text-lg font-bold text-brand">CRM ARG COLOR</div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                active ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <p className="truncate px-2 text-sm text-slate-600">{nombre}</p>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-500 transition hover:bg-slate-100"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
