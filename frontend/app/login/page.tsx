"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-xl font-bold text-brand">CRM Comercial ARG COLOR</h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Acceso interno del equipo comercial
        </p>
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
