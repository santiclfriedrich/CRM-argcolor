import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";

// Configuración de NextAuth con Google OAuth.
// El id_token de Google se guarda en el JWT para enviarlo al backend (/auth/login).
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.id_token) {
        token.googleIdToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      // @ts-expect-error - extendemos la sesión con el id_token de Google
      session.googleIdToken = token.googleIdToken;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
