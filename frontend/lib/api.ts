import axios from "axios";
import { signOut } from "next-auth/react";

// Cliente HTTP hacia el backend FastAPI.
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
});

// Token guardado en una variable de módulo y adjuntado por un request interceptor.
// Así cada llamada lee el token vigente en el momento de salir, sin depender del
// timing de un useEffect (evita la carrera donde el primer request sale sin token).
let currentToken: string | null = null;

export function setAuthToken(token: string | null): void {
  currentToken = token;
}

api.interceptors.request.use((config) => {
  if (currentToken) {
    config.headers.Authorization = `Bearer ${currentToken}`;
  }
  return config;
});

// Ante un 401 forzamos re-login SOLO si el request llevaba token (= expiró o es
// inválido). Si no llevaba token (carrera de arranque, sesión aún cargando), no
// deslogueamos: React Query reintenta y para entonces el token ya está seteado.
let redirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const hadAuth = Boolean(error?.config?.headers?.Authorization);
    if (status === 401 && hadAuth && typeof window !== "undefined" && !redirectingToLogin) {
      redirectingToLogin = true;
      setAuthToken(null);
      void signOut({ callbackUrl: "/login" });
    }
    return Promise.reject(error);
  }
);
