"use client";

import {
  LayoutDashboard,
  Target,
  Building2,
  FileText,
  Settings,
} from "lucide-react";
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

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-6 py-5 text-lg font-bold text-brand">CRM ARG COLOR</div>
      <nav className="flex flex-col gap-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand text-white"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
