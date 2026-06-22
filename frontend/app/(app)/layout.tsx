import { Sidebar } from "@/components/layout/sidebar";

// Layout de las páginas internas: sidebar fijo + área de contenido.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
