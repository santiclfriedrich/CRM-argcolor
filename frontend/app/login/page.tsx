"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  no_autorizado:
    "Tu usuario no está habilitado. Pedí al administrador que te dé de alta en el CRM.",
  error_login: "Hubo un problema al iniciar sesión. Intentá de nuevo.",
  backend_inaccesible:
    "No se pudo conectar con el servidor. ¿Está corriendo el backend?",
};

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Si ya hay sesión válida (con token del backend), entrar al dashboard.
  useEffect(() => {
    if (status === "authenticated" && session?.backendToken) {
      router.replace("/");
    }
  }, [status, session?.backendToken, router]);

  const error = session?.authError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-800/50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
        <h1 className="text-center text-xl font-bold text-brand">CRM Comercial ARG COLOR</h1>
        <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
          Acceso interno del equipo comercial
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {ERROR_MESSAGES[error] ?? "Error desconocido."}
          </p>
        )}

        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="mt-6 w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-light"
        >
          Ingresar con Google
        </button>
      </div>
    </div>
  );
}
