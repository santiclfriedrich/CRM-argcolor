import { AuthGuard } from "@/components/layout/auth-guard";
import { ToDoBar } from "@/components/layout/todo-bar";
import { TopNav } from "@/components/layout/top-nav";
import { SeccionProvider } from "@/components/ui/seccion";

// Layout de las páginas internas: requiere sesión, menú superior + contenido.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SeccionProvider>
        {/* Alto fijo: el menú queda arriba y solo scrollea el contenido. */}
        <div className="flex h-screen flex-col overflow-hidden">
          <TopNav />
          {/* pb-14: espacio para que la barra To-Do fija no tape el contenido. */}
          <main className="flex-1 overflow-y-auto px-4 py-6 pb-14 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
        <ToDoBar />
      </SeccionProvider>
    </AuthGuard>
  );
}
