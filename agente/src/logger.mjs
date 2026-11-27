// ============================================================================
//  LOG
// ----------------------------------------------------------------------------
//  Consola + archivo agente/datos/agente.log (se rota a .old al pasar 5 MB).
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";

const ARCHIVO = path.join(config.dirDatos, "agente.log");
const MAXIMO = 5 * 1024 * 1024;

function sello() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

function escribir(nivel, mensaje) {
  const linea = `[${sello()}] ${nivel} ${mensaje}`;
  if (nivel === "ERROR") console.error(linea);
  else console.log(linea);
  try {
    fs.mkdirSync(config.dirDatos, { recursive: true });
    if (fs.existsSync(ARCHIVO) && fs.statSync(ARCHIVO).size > MAXIMO) {
      fs.renameSync(ARCHIVO, ARCHIVO + ".old");
    }
    fs.appendFileSync(ARCHIVO, linea + "\n", "utf8");
  } catch {
    // sin log en disco: la consola alcanza
  }
}

export const log = {
  info: (m) => escribir("INFO ", m),
  ok: (m) => escribir("OK   ", m),
  aviso: (m) => escribir("AVISO", m),
  error: (m) => escribir("ERROR", m),
};
