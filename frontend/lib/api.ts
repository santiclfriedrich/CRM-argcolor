import axios from "axios";

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
