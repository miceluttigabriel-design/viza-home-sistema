// ============================================================================
//  RECETA DE NAVEGADOR (Playwright)
// ----------------------------------------------------------------------------
//  El CtrCredito no tiene una API conocida: se entra con un navegador real y
//  se aprieta EXPORTAR. En vez de clavar selectores en el codigo, la receta es
//  un JSON que se puede ajustar sin tocar el agente.
//
//  Formato:
//  {
//    "url": "http://170.233.219.8/",
//    "pasos": [
//      { "accion": "esperar", "ms": 800 },
//      { "accion": "llenar", "selector": "#usuario", "valor": "{{ERP_USUARIO}}" },
//      { "accion": "llenar", "selector": "#clave", "valor": "{{ERP_CLAVE}}" },
//      { "accion": "click", "selector": "#btnEntrar" },
//      { "accion": "esperarSelector", "selector": "#menu", "timeoutMs": 30000 },
//      { "accion": "click", "selector": "text=Reportes" },
//      { "accion": "click", "selector": "text=Inventario" },
//      { "accion": "descargar", "selector": "#btnExportar", "timeoutMs": 120000 }
//    ]
//  }
//
//  Acciones: ir, esperar, llenar, click, presionar, esperarSelector,
//            esperarTexto, descargar, captura.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { log } from "./logger.mjs";

function sustituir(valor) {
  return String(valor ?? "").replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/gi, (_, clave) => {
    return process.env[clave] ?? "";
  });
}

function leerReceta() {
  if (!fs.existsSync(config.erpReceta)) {
    throw new Error(`No existe la receta del navegador: ${config.erpReceta}`);
  }
  const receta = JSON.parse(fs.readFileSync(config.erpReceta, "utf8"));
  if (!Array.isArray(receta.pasos) || receta.pasos.length === 0) {
    throw new Error("La receta no tiene pasos");
  }
  return receta;
}

export async function exportarConNavegador() {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error(
      "Falta Playwright. En la carpeta agente/ ejecuta:  npm install  y despues  npx playwright install chromium"
    );
  }

  const receta = leerReceta();
  const descargas = path.join(config.dirDatos, "descargas");
  fs.mkdirSync(descargas, { recursive: true });

  // Usa el Edge ya instalado en Windows (no hace falta bajar Chromium).
  // Si el canal falla, cae al Chromium de Playwright.
  const canal = process.env.ERP_NAVEGADOR_CANAL || "msedge";
  let navegador;
  try {
    navegador = await playwright.chromium.launch({
      headless: !config.erpMostrarNavegador,
      channel: canal,
      downloadsPath: descargas,
    });
  } catch (errorCanal) {
    log.aviso(`No se pudo abrir ${canal} (${errorCanal.message}). Probando Chromium...`);
    navegador = await playwright.chromium.launch({
      headless: !config.erpMostrarNavegador,
      downloadsPath: descargas,
    });
  }

  try {
    const contexto = await navegador.newContext({ acceptDownloads: true });
    const pagina = await contexto.newPage();
    pagina.setDefaultTimeout(30_000);

    await pagina.goto(sustituir(receta.url), { waitUntil: "domcontentloaded" });

    let archivoDescargado = null;

    for (const paso of receta.pasos) {
      const accion = String(paso.accion || "").toLowerCase();
      const selector = sustituir(paso.selector);
      const timeout = Number(paso.timeoutMs) || 30_000;

      if (accion === "ir") {
        await pagina.goto(sustituir(paso.url), { waitUntil: "domcontentloaded" });
      } else if (accion === "esperar") {
        await pagina.waitForTimeout(Number(paso.ms) || 500);
      } else if (accion === "llenar") {
        await pagina.locator(selector).first().fill(sustituir(paso.valor), { timeout });
      } else if (accion === "click") {
        await pagina.locator(selector).first().click({ timeout });
      } else if (accion === "presionar") {
        await pagina.locator(selector).first().press(sustituir(paso.valor) || "Enter", {
          timeout,
        });
      } else if (accion === "esperarSelector") {
        await pagina.locator(selector).first().waitFor({ state: "visible", timeout });
      } else if (accion === "esperarTexto") {
        await pagina.getByText(sustituir(paso.valor), { exact: false }).first().waitFor({
          state: "visible",
          timeout,
        });
      } else if (accion === "captura") {
        const destino = path.join(descargas, `captura-${Date.now()}.png`);
        await pagina.screenshot({ path: destino, fullPage: true });
        log.info(`Captura guardada: ${destino}`);
      } else if (accion === "descargar") {
        const espera = pagina.waitForEvent("download", { timeout });
        await pagina.locator(selector).first().click({ timeout });
        const descarga = await espera;
        const nombre = descarga.suggestedFilename() || `planilla-${Date.now()}.xlsx`;
        const destino = path.join(descargas, `${Date.now()}-${nombre}`);
        await descarga.saveAs(destino);
        archivoDescargado = destino;
        log.ok(`Planilla descargada del ERP: ${destino}`);
      } else {
        throw new Error(`Accion desconocida en la receta: ${paso.accion}`);
      }
    }

    if (!archivoDescargado) {
      throw new Error("La receta termino sin descargar ninguna planilla (falta un paso descargar)");
    }
    return archivoDescargado;
  } finally {
    await navegador.close().catch(() => {});
  }
}
