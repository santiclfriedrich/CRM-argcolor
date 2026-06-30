import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Configuración de NextAuth con Google OAuth.
// Flujo: login Google -> obtenemos su id_token -> lo canjeamos en el backend
// (/api/v1/auth/login) por un JWT propio que viaja en la sesión y se usa para
// autenticar todas las llamadas a la API.
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Pedimos también acceso a Gmail (leer + enviar) y offline para obtener un
      // refresh token por usuario. prompt=consent garantiza que Google lo emita.
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile " +
            "https://www.googleapis.com/auth/gmail.readonly " +
            "https://www.googleapis.com/auth/gmail.send",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Solo en el primer login (cuando Google devuelve la cuenta) canjeamos el token.
      if (account?.id_token) {
        try {
          const res = await fetch(`${API_URL}/api/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id_token: account.id_token,
              // Solo viene en el primer consentimiento (o con prompt=consent).
              gmail_refresh_token: account.refresh_token ?? null,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            token.backendToken = data.access_token;
            token.usuario = data.usuario;
            token.authError = null;
          } else {
            // 403 = usuario no dado de alta en la DB (whitelist).
            token.authError = res.status === 403 ? "no_autorizado" : "error_login";
          }
        } catch {
          token.authError = "backend_inaccesible";
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.backendToken = token.backendToken as string | undefined;
      session.usuario = token.usuario as Record<string, unknown> | undefined;
      session.authError = token.authError as string | null | undefined;
      return session;
    },
  },
  // Alineado con la vida del JWT del backend (ACCESS_TOKEN_EXPIRE_MINUTES=480).
  // Sesión y token del backend vencen juntos: un único re-login renueva todo.
  session: {
    maxAge: 60 * 60 * 8, // 8 horas
  },
  pages: {
    signIn: "/login",
  },
};
