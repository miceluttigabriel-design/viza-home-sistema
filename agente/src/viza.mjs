// ============================================================================
//  CLIENTE DEL SISTEMA VIZA
// ----------------------------------------------------------------------------
//  Entra con NextAuth (credenciales), mantiene la cookie de sesion y expone
//  las llamadas que usa el robot: heartbeat, turno, preview, apply, resultado.
//  Si la sesion vence (401), vuelve a entrar sola una vez.
// ============================================================================
import { config } from "./config.mjs";
import { crearClienteHttp, CookieJar } from "./http.mjs";
import { log } from "./logger.mjs";

export class VizaClient {
  constructor() {
    this.base = config.vizaUrl;
    this.http = crearClienteHttp(new CookieJar());
    this.entrando = null;
  }

  async login() {
    if (this.entrando) return this.entrando;
    this.entrando = (async () => {
      log.info("Entrando al sistema VIZA...");
      const csrf = await this.http.json(`${this.base}/api/auth/csrf`);
      const token = csrf.datos?.csrfToken;
      if (!token) throw new Error("No se pudo obtener el token de login (csrf)");

      const cuerpo = new URLSearchParams({
        csrfToken: token,
        email: config.email,
        password: config.password,
        callbackUrl: `${this.base}/`,
        json: "true",
      });

      const res = await this.http.pedir(`${this.base}/api/auth/callback/credentials`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: cuerpo.toString(),
      });

      const texto = await res.text();
      let datos = null;
      try {
        datos = texto ? JSON.parse(texto) : null;
      } catch {
        datos = null;
      }

      const url = String(datos?.url || "");
      if (url.includes("error=")) {
        throw new Error(
          "Login rechazado. Revisa VIZA_EMAIL / VIZA_PASSWORD (el usuario tiene que ser supremo_admin)."
        );
      }
      if (res.status >= 400) {
        throw new Error(`Login fallo (HTTP ${res.status})`);
      }

      // Verificacion real: pedir el estado del stock automatico.
      const prueba = await this.http.json(`${this.base}/api/stock-auto`);
      if (prueba.res.status === 401 || !prueba.datos) {
        throw new Error("El login respondio pero la sesion no quedo activa");
      }
      if (prueba.res.status === 403) {
        throw new Error("El usuario del robot no tiene permiso (tiene que ser admin/supremo)");
      }
      if (!prueba.res.ok) {
        throw new Error(`No se pudo leer el estado (HTTP ${prueba.res.status})`);
      }

      log.ok(`Sesion iniciada como ${config.email}`);
      return true;
    })();

    try {
      return await this.entrando;
    } finally {
      this.entrando = null;
    }
  }

  // Envuelve una llamada: si vuelve 401, re-loguea y reintenta una vez.
  async conSesion(fn) {
    if (!this.http.jar.cabecera()) await this.login();
    let resultado = await fn();
    if (resultado?.res?.status === 401) {
      log.aviso("La sesion vencio. Volviendo a entrar...");
      this.http.jar.vaciar();
      await this.login();
      resultado = await fn();
    }
    return resultado;
  }

  async heartbeat() {
    const r = await this.conSesion(() =>
      this.http.json(`${this.base}/api/stock-auto/agente`, { method: "POST" })
    );
    if (!r.res.ok || !r.datos) {
      throw new Error(`Heartbeat fallo (HTTP ${r.res.status})`);
    }
    return r.datos;
  }

  async pedirTurno() {
    const r = await this.conSesion(() =>
      this.http.json(`${this.base}/api/stock-auto/turno`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pc: config.pcNombre }),
      })
    );
    if (!r.res.ok || !r.datos) {
      throw new Error(`Turno fallo (HTTP ${r.res.status})`);
    }
    return r.datos;
  }

  async avisarEtapa(etapa, mensaje = "") {
    try {
      await this.conSesion(() =>
        this.http.json(`${this.base}/api/stock-auto/etapa`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ etapa, mensaje }),
        })
      );
    } catch {
      // La etapa es informativa: si falla, la corrida sigue igual.
    }
  }

  async preview(archivo) {
    const r = await this.conSesion(() =>
      this.http.subirArchivo(`${this.base}/api/products/import-stock/preview`, archivo)
    );
    if (!r.res.ok || !r.datos) {
      throw new Error(
        `Preview fallo (HTTP ${r.res.status}): ${r.datos?.error || r.texto?.slice(0, 200) || "sin detalle"}`
      );
    }
    return r.datos;
  }

  async aplicar(preview) {
    const cuerpo = {
      nuevos: preview.nuevos || [],
      actualizados: preview.actualizados || [],
      stockPorSucursal: preview.stockPorSucursal || {},
    };
    const r = await this.conSesion(() =>
      this.http.json(`${this.base}/api/products/import-stock/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      })
    );
    if (!r.res.ok || !r.datos?.ok) {
      throw new Error(
        `Apply fallo (HTTP ${r.res.status}): ${r.datos?.error || r.texto?.slice(0, 300) || "sin detalle"}`
      );
    }
    return r.datos;
  }

  async resultado(datos) {
    const r = await this.conSesion(() =>
      this.http.json(`${this.base}/api/stock-auto/resultado`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(datos),
      })
    );
    if (!r.res.ok) {
      throw new Error(`No se pudo guardar el resultado (HTTP ${r.res.status})`);
    }
  }
}
