"use client";

import {
  LayoutDashboard,
  Inbox,
  Target,
  Building2,
  ClipboardList,
  FileText,
  Settings,
  UsersRound,
  LogOut,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/bandeja", label: "Bandeja", icon: Inbox },
  { href: "/oportunidades", label: "Oportunidades", icon: Target },
  { href: "/clientes", label: "Clientes", icon: Building2 },
  { href: "/solicitudes", label: "Compras", icon: ClipboardList },
  { href: "/presupuestos", label: "Presupuestos", icon: FileText },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const nombre = (session?.usuario?.nombre as string) ?? session?.user?.name ?? "Usuario";
  const gmailConectado = Boolean(
    (session?.usuario as { gmail_conectado?: boolean } | undefined)?.gmail_conectado
  );
  const esAdmin = (session?.usuario as { rol?: string } | undefined)?.rol === "admin";
  const nav = esAdmin
    ? [...NAV, { href: "/usuarios", label: "Usuarios", icon: UsersRound }]
    : NAV;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between px-6 py-5">
        <span className="text-lg font-bold text-brand dark:text-brand-light">CRM ARG COLOR</span>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <ThemeToggle compact />
        </div>
      </div>

      <div className="px-3 pb-3">
        <GlobalSearch />
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <p className="truncate px-2 text-sm text-slate-600 dark:text-slate-300">{nombre}</p>
        {gmailConectado ? (
          <p className="px-2 text-xs text-green-600 dark:text-green-500">✓ Gmail conectado</p>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="px-2 text-xs text-amber-600 hover:underline dark:text-amber-500"
          >
            Gmail sin conectar — conectar
          </button>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
