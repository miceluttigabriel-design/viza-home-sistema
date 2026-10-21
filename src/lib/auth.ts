import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 días
  },
  providers: [
    CredentialsProvider({
      name: "Credenciales VIZA",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@vizahome.com" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            console.log("[auth] Faltan credenciales");
            return null;
          }

          const email = credentials.email.toLowerCase().trim();
          console.log("[auth] Intentando login para:", email);

          const user = await db.user.findUnique({
            where: { email },
          });

          if (!user) {
            console.log("[auth] Usuario no encontrado");
            return null;
          }

          if (!user.active) {
            console.log("[auth] Usuario inactivo");
            return null;
          }

          const valid = await bcrypt.compare(credentials.password, user.password);
          if (!valid) {
            console.log("[auth] Password incorrecto");
            return null;
          }

          console.log("[auth] Login OK:", user.email, "rol:", user.role);
          return {
            id: user.id,
            email: user.email,
            name: user.name || user.email,
            role: user.role,
          } as any;
        } catch (err) {
          console.error("[auth] Error en authorize:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  secret: process.env.NEXTAUTH_SECRET || "viza-home-secret-development-key-change-in-prod",
};
