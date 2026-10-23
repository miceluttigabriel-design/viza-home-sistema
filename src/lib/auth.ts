import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

// Durante `next build` no hay request real: permitimos que el build termine
// aunque falte el secreto. En runtime de produccion SI es obligatorio.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

/**
 * El secreto firma los JWT de sesión. Si queda hardcodeado, cualquiera con
 * acceso al código puede falsificar un token de SUPREMO_ADMIN.
 */
function resolveSecret(): string {
  const fromEnv = process.env.NEXTAUTH_SECRET;

  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error(
      "[auth] NEXTAUTH_SECRET no está configurado o es demasiado corto. " +
        "Generá uno con `openssl rand -base64 32` y agregalo en las variables " +
        "de entorno (local y Vercel) antes de arrancar el servidor."
    );
  }

  // Solo desarrollo local / build. NUNCA usar esto en producción.
  return "viza-home-dev-secret-solo-para-desarrollo";
}

/** IP del cliente detrás de Vercel / proxy. */
function getClientIp(req: unknown): string {
  const headers = (req as { headers?: Record<string, unknown> } | undefined)?.headers;
  if (!headers) return "desconocida";
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw !== "string") return "desconocida";
  return raw.split(",")[0].trim() || "desconocida";
}

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
      async authorize(credentials, req) {
        try {
          if (!credentials?.email || !credentials?.password) {
            return null;
          }

          const email = credentials.email.toLowerCase().trim();
          const ip = getClientIp(req);

          // Anti fuerza bruta: 5 intentos cada 15 minutos por IP + email.
          // Al superar el límite se devuelve null (mismo error genérico que
          // una contraseña incorrecta, para no filtrar información).
          const rateKey = `login:${ip}:${email}`;
          const rate = checkRateLimit(rateKey, 5, 15 * 60 * 1000);
          if (!rate.ok) {
            console.warn(`[auth] Demasiados intentos de login para ${email} (IP ${ip})`);
            return null;
          }

          const user = await db.user.findUnique({ where: { email } });

          if (!user || !user.active) {
            return null;
          }

          const valid = await bcrypt.compare(credentials.password, user.password);
          if (!valid) {
            return null;
          }

          // Login correcto: liberamos el contador de esa IP + email.
          resetRateLimit(rateKey);

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
  secret: resolveSecret(),
};
