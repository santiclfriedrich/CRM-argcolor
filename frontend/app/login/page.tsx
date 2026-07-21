"use client";

import { signIn, useSession } from "next-auth/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  no_autorizado:
    "Tu usuario no está habilitado. Pedí al administrador que te dé de alta en el CRM.",
  error_login: "Hubo un problema al iniciar sesión. Intentá de nuevo.",
  backend_inaccesible:
    "No se pudo conectar con el servidor. ¿Está corriendo el backend?",
};

// Logo oficial de Google (4 colores) para el botón de acceso.
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy px-6 text-center">
      {/* Brillo sutil para dar profundidad al fondo navy. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.20), transparent 70%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <Image
          src="/logo-largo.png"
          alt="Argentina Color"
          width={280}
          height={50}
          priority
          className="h-12 w-auto brightness-0 invert sm:h-14"
        />

        <h1 className="mt-10 text-2xl font-bold text-white">CRM Comercial</h1>

        {error && (
          <p className="mt-6 w-full rounded-lg bg-red-500/15 px-4 py-2.5 text-sm text-red-100 ring-1 ring-red-400/30">
            {ERROR_MESSAGES[error] ?? "Error desconocido."}
          </p>
        )}

        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="mt-10 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-[#3c4043] shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#f1f3f4] hover:shadow-xl active:translate-y-0"
        >
          <GoogleIcon />
          Ingresar con Google
        </button>

        <p className="mt-12 text-xs text-white/40">ARG COLOR © 2026</p>
      </div>
    </div>
  );
}
