import "next-auth";
import "next-auth/jwt";

// Extendemos los tipos de NextAuth con los campos propios que agregamos
// (el JWT del backend, el usuario y un eventual error de login).
declare module "next-auth" {
  interface Session {
    backendToken?: string;
    usuario?: Record<string, unknown>;
    authError?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendToken?: string;
    usuario?: Record<string, unknown>;
    authError?: string | null;
  }
}
