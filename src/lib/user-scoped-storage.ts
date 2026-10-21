/**
 * Storage personalizado para Zustand persist.
 *
 * PROBLEMA: El localStorage está compartido entre todas las pestañas del mismo
 * navegador. Si dos usuarios (ej: admin y colaborador) están logueados en la
 * misma PC (en pestañas distintas), sus carritos se mezclarían.
 *
 * SOLUCIÓN: Usar el userId del usuario logueado como sufijo en el nombre del
 * localStorage. Así cada usuario tiene su propio espacio aislado:
 *   - "viza-cart-storage-user-abc123" (carrito del usuario abc123)
 *   - "viza-cart-storage-user-def456" (carrito del usuario def456)
 *
 * El userId se lee del localStorage "viza-current-user-id", que es seteado
 * por el componente SalesPanel al detectar la sesión activa de NextAuth.
 *
 * Si no hay userId (usuario no logueado todavía), se usa "anon" como
 * sufijo temporal, y cuando el usuario se loguea, se migran sus datos.
 */

// Clave donde el cliente setea el userId actual (lo hace SalesPanel desde useSession)
const USER_ID_KEY = "viza-current-user-id";

function getCurrentUserId(): string {
  if (typeof window === "undefined") return "anon";
  try {
    return localStorage.getItem(USER_ID_KEY) || "anon";
  } catch {
    return "anon";
  }
}

export const userScopedStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === "undefined") return null;
    try {
      const userId = getCurrentUserId();
      const scopedName = `${name}-user-${userId}`;
      return localStorage.getItem(scopedName);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === "undefined") return;
    try {
      const userId = getCurrentUserId();
      const scopedName = `${name}-user-${userId}`;
      localStorage.setItem(scopedName, value);
    } catch {
      // localStorage puede no estar disponible (modo incógnito en algunos browsers)
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === "undefined") return;
    try {
      const userId = getCurrentUserId();
      const scopedName = `${name}-user-${userId}`;
      localStorage.removeItem(scopedName);
    } catch {
      // ignore
    }
  },
};

/**
 * Helper para setear el userId actual desde el cliente.
 * Se llama en SalesPanel, AdminPanel, GestionAccesos al detectar la sesión.
 */
export function setCurrentUserId(userId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      localStorage.setItem(USER_ID_KEY, userId);
    } else {
      localStorage.removeItem(USER_ID_KEY);
    }
  } catch {
    // ignore
  }
}
