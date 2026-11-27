// ============================================================================
//  OBTENER LA PLANILLA DEL CTRCREDITO
// ----------------------------------------------------------------------------
//  Tres modos, elegidos en .env con ERP_MODO:
//    carpeta   -> toma el Excel mas nuevo de una carpeta (el ERP o una persona
//                 lo deja ahi). Nunca procesa dos veces el mismo archivo.
//    http      -> descarga el Excel desde una URL del ERP.
//    navegador -> entra con Playwright y aprieta EXPORTAR (ver receta).
//
//  Devuelve { archivo, origen } o null si todavia no hay planilla.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { log } from "./logger.mjs";
import { exportarConNavegador } from "./recipe.mjs";
import { exportarCtrCredito } from "./ctrcredito.mjs";

const ESTADO = path.join(config.dirDatos, "estado.json");

function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, "utf8"));
  } catch {
    return { procesados: {} };
  }
}

function guardarEstado(estado) {
  fs.mkdirSync(config.dirDatos, { recursive: true });
  fs.writeFileSync(ESTADO, JSON.stringify(estado, null, 2), "utf8");
}

function coincide(nombre) {
  return config.erpPatrones.some((patron) => {
    if (patron.startsWith("*.")) return nombre.toLowerCase().endsWith(patron.slice(1));
    return nombre.toLowerCase() === patron;
  });
}

function buscarEnCarpeta() {
  if (!fs.existsSync(config.erpCarpeta)) {
    throw new Error(`La carpeta del ERP no existe: ${config.erpCarpeta}`);
  }
  const estado = leerEstado();
  const candidatos = fs
    .readdirSync(config.erpCarpeta)
    .filter((n) => coincide(n))
    .map((n) => {
      const completo = path.join(config.erpCarpeta, n);
      const st = fs.statSync(completo);
      return { archivo: completo, mtimeMs: st.mtimeMs, tamano: st.size };
    })
    .filter((f) => f.tamano > 0)
    .filter((f) => estado.procesados[f.archivo] !== f.mtimeMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (candidatos.length === 0) return null;
  return { archivo: candidatos[0].archivo, origen: "carpeta", mtimeMs: candidatos[0].mtimeMs };
}

async function descargarHttp() {
  const res = await fetch(config.erpUrl, {
    headers: config.erpCabeceras,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`El ERP respondio HTTP ${res.status} al descargar la planilla`);
  }
  const tipo = String(res.headers.get("content-type") || "").toLowerCase();
  if (tipo.includes("text/html")) {
    throw new Error(
      "El ERP devolvio una pagina HTML en vez del Excel. Revisa ERP_URL (puede pedir sesion)."
    );
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 2000) {
    throw new Error("El archivo descargado del ERP es demasiado chico (posible error)");
  }
  const dir = path.join(config.dirDatos, "descargas");
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, `erp-${Date.now()}.xlsx`);
  fs.writeFileSync(destino, buffer);
  log.ok(`Planilla descargada: ${destino} (${Math.round(buffer.length / 1024)} KB)`);
  return destino;
}

// Devuelve la planilla a importar, o null si todavia no hay nada nuevo.
export async function obtenerPlanilla() {
  if (config.erpModo === "carpeta") {
    const encontrado = buscarEnCarpeta();
    if (!encontrado) return null;
    log.info(`Planilla nueva: ${encontrado.archivo}`);
    return encontrado;
  }

  if (config.erpModo === "http") {
    const archivo = await descargarHttp();
    return { archivo, origen: "http" };
  }

  if (config.erpModo === "navegador") {
    const archivo = await exportarCtrCredito();
    return { archivo, origen: "navegador" };
  }

  throw new Error(`ERP_MODO desconocido: ${config.erpModo}`);
}

// Marca la planilla como procesada (y la mueve si esta en modo carpeta).
export function marcarProcesada(planilla) {
  const estado = leerEstado();
  const mtimeMs = planilla.mtimeMs ?? fs.statSync(planilla.archivo).mtimeMs;
  estado.procesados[planilla.archivo] = mtimeMs;

  // Limpieza: no guardar para siempre rutas que ya no existen.
  for (const ruta of Object.keys(estado.procesados)) {
    if (!fs.existsSync(ruta)) delete estado.procesados[ruta];
  }
  guardarEstado(estado);

  if (planilla.origen === "carpeta" && config.erpMoverDespues) {
    try {
      const dir = path.join(config.erpCarpeta, "procesados");
      fs.mkdirSync(dir, { recursive: true });
      const destino = path.join(dir, path.basename(planilla.archivo));
      fs.renameSync(planilla.archivo, destino);
      log.info(`Planilla movida a: ${destino}`);
    } catch (error) {
      log.aviso(`No se pudo mover la planilla: ${error.message}`);
    }
  }
}
