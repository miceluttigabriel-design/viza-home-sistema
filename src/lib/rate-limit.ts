/**
 * Rate limit simple en memoria (por instancia del servidor).
 *
 * Sirve para frenar ataques de fuerza bruta al login y abuso de endpoints
 * costosos. En Vercel cada instancia serverless tiene su propia memoria, asi
 * que el limite es "por instancia": no es perfecto, pero frena lo basico sin
 * agregar dependencias ni servicios externos.
 *
 * Si mas adelante se necesita un limite global, reemplazar el Map por
 * Upstash Redis / Vercel KV manteniendo la misma interfaz.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Evita que el Map crezca sin limite en procesos de larga duracion.
const MAX_BUCKETS = 10_000;

function prune(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

/**
 * Registra un intento para `key` y devuelve si esta permitido.
 *
 * @param key      Identificador del intento (ej: "login:ip:email")
 * @param limit    Cantidad maxima de intentos por ventana
 * @param windowMs Duracion de la ventana en milisegundos
 */
export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 15 * 60 * 1000
): RateLimitResult {
  const now = Date.now();
  prune(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

/** Borra el contador de una key (usar tras un login exitoso). */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
