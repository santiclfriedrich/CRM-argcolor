import axios from "axios";
import { signOut } from "next-auth/react";

// Cliente HTTP hacia el backend FastAPI.
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
});

// El token JWT se inyecta desde el contexto de sesión (NextAuth) en Fase 1.
export function setAuthToken(token: string | null): void {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
}

// El JWT del backend vence (1 día) antes que la sesión de NextAuth (~30 días).
// Cuando eso pasa, todas las llamadas dan 401 aunque sigamos "logueados".
// Ante un 401 forzamos re-login: NextAuth vuelve a canjear el id_token de
// Google por un JWT fresco. Evita el estado confuso de "sesión viva, token muerto".
let redirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 && typeof window !== "undefined" && !redirectingToLogin) {
      redirectingToLogin = true;
      setAuthToken(null);
      void signOut({ callbackUrl: "/login" });
    }
    return Promise.reject(error);
  }
);
