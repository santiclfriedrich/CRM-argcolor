import { AuthGuard } from "@/components/layout/auth-guard";
import { Sidebar } from "@/components/layout/sidebar";

// Layout de las páginas internas: requiere sesión, sidebar fijo + contenido.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </AuthGuard>
  );
}
