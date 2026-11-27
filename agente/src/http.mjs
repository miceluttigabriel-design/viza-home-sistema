// ============================================================================
//  HTTP CON COOKIES
// ----------------------------------------------------------------------------
//  fetch de Node no guarda cookies solo. Este jar mínimo mantiene la sesion de
//  NextAuth entre pedidos (login -> heartbeat -> preview -> apply -> resultado).
// ============================================================================
import fs from "node:fs";
import path from "node:path";

export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  guardar(res) {
    let lineas = [];
    if (typeof res.headers.getSetCookie === "function") {
      lineas = res.headers.getSetCookie();
    } else {
      const una = res.headers.get("set-cookie");
      if (una) lineas = [una];
    }
    for (const linea of lineas) {
      const par = linea.split(";")[0];
      const igual = par.indexOf("=");
      if (igual <= 0) continue;
      const nombre = par.slice(0, igual).trim();
      const valor = par.slice(igual + 1).trim();
      const vencida = /expires=thu,?\s*01\s*jan\s*1970/i.test(linea);
      if (!valor || vencida) this.cookies.delete(nombre);
      else this.cookies.set(nombre, valor);
    }
  }

  cabecera() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  vaciar() {
    this.cookies.clear();
  }
}

const TIMEOUT_MS = 60_000;

export function crearClienteHttp(jar = new CookieJar()) {
  async function pedir(url, opciones = {}) {
    const cabeceras = new Headers(opciones.headers || {});
    const cookie = jar.cabecera();
    if (cookie) cabeceras.set("cookie", cookie);
    if (!cabeceras.has("user-agent")) {
      cabeceras.set("user-agent", "VizaAgenteStock/1.0 (+Windows)");
    }
    const res = await fetch(url, {
      ...opciones,
      headers: cabeceras,
      redirect: opciones.redirect ?? "manual",
      signal: AbortSignal.timeout(opciones.timeoutMs ?? TIMEOUT_MS),
    });
    jar.guardar(res);
    return res;
  }

  async function json(url, opciones = {}) {
    const res = await pedir(url, opciones);
    const texto = await res.text();
    let datos = null;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      datos = null;
    }
    return { res, datos, texto };
  }

  async function subirArchivo(url, archivo, campo = "file") {
    const buffer = fs.readFileSync(archivo);
    const fd = new FormData();
    const nombre = path.basename(archivo);
    const tipo = nombre.toLowerCase().endsWith(".xls")
      ? "application/vnd.ms-excel"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    fd.append(campo, new Blob([buffer], { type: tipo }), nombre);
    return json(url, { method: "POST", body: fd });
  }

  return { pedir, json, subirArchivo, jar };
}
