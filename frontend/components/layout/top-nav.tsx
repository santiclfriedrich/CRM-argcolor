"use client";

import {
  Building2,
  ClipboardList,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Settings,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationBell } from "@/components/layout/notification-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/bandeja", label: "Bandeja", icon: Inbox },
  { href: "/oportunidades", label: "Oportunidades", icon: Target },
  { href: "/clientes", label: "Cuentas", icon: Building2 },
  { href: "/solicitudes", label: "Compras", icon: ClipboardList },
  { href: "/presupuestos", label: "Presupuestos", icon: FileText },
  { href: "/tareas", label: "Tareas", icon: ListChecks },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const nombre = (session?.usuario?.nombre as string) ?? session?.user?.name ?? "Usuario";
  const gmailConectado = Boolean(
    (session?.usuario as { gmail_conectado?: boolean } | undefined)?.gmail_conectado
  );
  const esAdmin = (session?.usuario as { rol?: string } | undefined)?.rol === "admin";
  const nav = esAdmin
    ? [...NAV, { href: "/usuarios", label: "Usuarios", icon: UsersRound }]
    : NAV;

  const activo = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const iniciales = nombre.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-14 items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
          aria-label="Menú"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link href="/" className="shrink-0 text-base font-bold text-brand dark:text-brand-light">
          CRM ARG COLOR
        </Link>

        {/* Nav horizontal (desktop) */}
        <nav className="hidden flex-1 items-center gap-0.5 lg:flex">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-14 items-center border-b-2 px-3 text-sm font-medium transition",
                activo(href)
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden w-44 sm:block xl:w-56">
            <GlobalSearch />
          </div>
          <NotificationBell />
          <ThemeToggle compact />

          {/* Menú de usuario */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
              aria-label="Cuenta"
            >
              {iniciales || "U"}
            </button>
            {userOpen && (
              <>
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setUserOpen(false)}
                />
                <div className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {nombre}
                  </p>
                  {gmailConectado ? (
                    <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">
                      ✓ Gmail conectado
                    </p>
                  ) : (
                    <button
                      onClick={() => signIn("google")}
                      className="mt-0.5 text-xs text-amber-600 hover:underline dark:text-amber-500"
                    >
                      Gmail sin conectar — conectar
                    </button>
                  )}
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <LogOut size={16} /> Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Menú mobile desplegable */}
      {menuOpen && (
        <div className="border-t border-slate-200 dark:border-slate-800 lg:hidden">
          <div className="p-3 sm:hidden">
            <GlobalSearch />
          </div>
          <nav className="flex flex-col gap-0.5 px-2 pb-3">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                  activo(href)
                    ? "bg-brand text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                <Icon size={18} /> {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
