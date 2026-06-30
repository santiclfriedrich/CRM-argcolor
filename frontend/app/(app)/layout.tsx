import { AuthGuard } from "@/components/layout/auth-guard";
import { Sidebar } from "@/components/layout/sidebar";

// Layout de las páginas internas: requiere sesión, sidebar fijo + contenido.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {/* Alto fijo a la pantalla: el sidebar queda fijo y solo scrollea el contenido. */}
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </div>
    </AuthGuard>
  );
}
