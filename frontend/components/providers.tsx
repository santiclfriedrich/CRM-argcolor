"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "next-auth/react";
import { useState, type ReactNode } from "react";

import { setAuthToken } from "@/lib/api";

// Sincroniza el JWT del backend (guardado en la sesión) con axios.
// Se setea DURANTE el render (no en un useEffect) para que el token esté
// disponible antes de que los componentes hijos disparen sus queries.
function ApiTokenSync({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  setAuthToken(session?.backendToken ?? null);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ApiTokenSync>{children}</ApiTokenSync>
      </QueryClientProvider>
    </SessionProvider>
  );
}
