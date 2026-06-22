"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";

import { setAuthToken } from "@/lib/api";

// Sincroniza el JWT del backend (guardado en la sesión) con el header de axios,
// para que todas las llamadas a la API salgan autenticadas.
function ApiTokenSync({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    setAuthToken(session?.backendToken ?? null);
  }, [session?.backendToken]);

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
