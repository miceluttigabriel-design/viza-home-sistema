// ============================================================================
//  CONFIGURACION DEL AGENTE
// ----------------------------------------------------------------------------
//  Lee agente/.env (sin dependencias) y deja todo normalizado en un objeto.
//  Los caminos relativos se resuelven contra la raiz del repositorio.
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url)); // agente/src
export const DIR_AGENTE = path.resolve(AQUI, "..");
export const DIR_REPO = path.resolve(DIR_AGENTE, "..");

function leerEnv(archivo) {
  const valores = {};
  if (!fs.existsSync(archivo)) return valores;
  const texto = fs.readFileSync(archivo, "utf8");
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const igual = limpia.indexOf("=");
    if (igual <= 0) continue;
    const clave = limpia.slice(0, igual).trim();
    let valor = limpia.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    valores[clave] = valor;
  }
  return valores;
}

const env = {
  ...leerEnv(path.join(DIR_AGENTE, ".env")),
  ...process.env, // lo que venga del sistema gana
};

// Las variables del .env tambien quedan visibles para las recetas
// ({{ERP_USUARIO}}, {{ERP_CLAVE}}, etc.).
for (const [clave, valor] of Object.entries(env)) {
  if (process.env[clave] === undefined) process.env[clave] = valor;
}

function texto(clave, defecto = "") {
  const v = env[clave];
  return v === undefined || v === null || String(v).trim() === ""
    ? defecto
    : String(v).trim();
}

function numero(clave, defecto) {
  const n = Number(texto(clave, ""));
  return Number.isFinite(n) ? n : defecto;
}

function booleano(clave, defecto = false) {
  const v = texto(clave, "").toLowerCase();
  if (!v) return defecto;
  return v === "1" || v === "true" || v === "si" || v === "sí";
}

function absoluto(valor, base = DIR_REPO) {
  if (!valor) return "";
  return path.isAbsolute(valor) ? valor : path.resolve(base, valor);
}

const patrones = texto("ERP_PATRON", "*.xlsx,*.xlsm,*.xls")
  .split(",")
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);

let cabeceras = {};
if (texto("ERP_HEADERS")) {
  try {
    cabeceras = JSON.parse(texto("ERP_HEADERS"));
  } catch {
    cabeceras = {};
  }
}

export const config = {
  vizaUrl: texto("VIZA_URL", "https://sistema.viza.com.py").replace(/\/+$/, ""),
  email: texto("VIZA_EMAIL"),
  password: texto("VIZA_PASSWORD"),
  pcNombre: texto("PC_NOMBRE", os.hostname()),

  intervaloMs: Math.max(30, numero("INTERVALO_SEG", 60)) * 1000,
  ventanaDesde: numero("VENTANA_DESDE", 7),
  ventanaHasta: numero("VENTANA_HASTA", 18),
  corridaCadaMs: Math.max(5, numero("CORRIDA_CADA_MIN", 60)) * 60 * 1000,

  erpModo: texto("ERP_MODO", "carpeta").toLowerCase(),
  erpCarpeta: absoluto(texto("ERP_CARPETA", "")),
  erpPatrones: patrones.length ? patrones : ["*.xlsx"],
  erpMoverDespues: booleano("ERP_MOVER_DESPUES", true),
  erpUrl: texto("ERP_URL"),
  erpCabeceras: cabeceras,
  erpReceta: absoluto(texto("ERP_RECETA", "agente/recetas/ctrcredito.json")),
  erpMostrarNavegador: booleano("ERP_MOSTRAR_NAVEGADOR", false),

  dirDatos: absoluto(texto("AGENTE_DIR", "agente/datos")),
};

export function validarConfig() {
  const faltan = [];
  if (!config.email) faltan.push("VIZA_EMAIL");
  if (!config.password) faltan.push("VIZA_PASSWORD");
  if (config.erpModo === "carpeta" && !config.erpCarpeta) faltan.push("ERP_CARPETA");
  if (config.erpModo === "http" && !config.erpUrl) faltan.push("ERP_URL");
  // El modo navegador usa el flujo integrado del CtrCredito (ctrcredito.mjs).
  // ERP_RECETA es opcional: solo se usa en el modo generico (recipe.mjs).
  if (!["carpeta", "http", "navegador"].includes(config.erpModo)) {
    faltan.push("ERP_MODO (tiene que ser carpeta, http o navegador)");
  }
  return faltan;
}
