// ============================================================================
//  EXPORTACION DEL CTRCREDITO (ScriptCase)
// ----------------------------------------------------------------------------
//  Flujo real, descubierto con el explorador:
//    1. Login
//    2. Aceptar el formulario inicial (sub_form_b)
//    3. Abrir "Informe de Inventario de Stock" (menu_item_88)
//    4. En la grilla, apretar "Busqueda" (sc_b_pesq_bot)
//    5. Apretar "Exportar" (sc_btgp_btn_group_1_top) y luego "Excel" (xls_top)
//    6. En el modal de config, apretar "Aceptar" (bok)
//    7. Polling del archivo de progreso hasta que complete:true
//    8. Descargar el archivo desde el link que devuelve el progreso
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { log } from "./logger.mjs";

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function lanzarNavegador() {
  const { chromium } = await import("playwright");
  const canal = process.env.ERP_NAVEGADOR_CANAL || "msedge";
  try {
    return await chromium.launch({ headless: !config.erpMostrarNavegador, channel: canal });
  } catch {
    log.aviso(`No se pudo abrir ${canal}; usando Chromium de Playwright.`);
    return await chromium.launch({ headless: !config.erpMostrarNavegador });
  }
}

export async function exportarCtrCredito() {
  const usuario = process.env.ERP_USUARIO || "";
  const clave = process.env.ERP_CLAVE || "";
  if (!usuario || !clave) {
    throw new Error("Falta ERP_USUARIO o ERP_CLAVE en agente/.env");
  }

  const descargas = path.join(config.dirDatos, "descargas");
  fs.mkdirSync(descargas, { recursive: true });

  const navegador = await lanzarNavegador();
  try {
    const pagina = await navegador.newPage();
    pagina.setDefaultTimeout(30_000);

    // 1. Login
    log.info("Entrando al CtrCredito...");
    await pagina.goto(process.env.ERP_URL_LOGIN || "http://170.233.219.8:8080/", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await pagina.locator("input[name=login]").first().fill(usuario);
    await pagina.locator("input[name=pswd]").first().fill(clave);
    await pagina.locator("input.btn-signin").first().click();
    await esperar(7000);

    // 2. Aceptar el formulario inicial
    const urlSesion = pagina
      .frames()
      .map((f) => f.url())
      .find((u) => u.includes("app_logged") && u.includes("script_case_session"));
    if (!urlSesion) throw new Error("No se pudo iniciar sesion en el CtrCredito (revisa usuario/clave)");
    await pagina.goto(urlSesion, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await esperar(4000);
    const btnAceptar = pagina.locator("#sub_form_b").first();
    if (await btnAceptar.count()) {
      await btnAceptar.click();
      await esperar(5000);
    }

    // 3. Abrir "Informe de Inventario de Stock"
    log.info("Abriendo Informe de Inventario de Stock...");
    await pagina.evaluate(() => {
      if (window.openMenuItem) window.openMenuItem("menu_item_88");
    });
    await esperar(9000);

    // 4. Encontrar el frame de la grilla y apretar "Busqueda"
    let frame = pagina.frames().find((f) => f.url().includes("grid_inventario_stock_new"));
    if (!frame) throw new Error("No aparecio la grilla de inventario");
    const linkBusq = frame.locator("#sc_b_pesq_bot").first();
    if (await linkBusq.count()) {
      await linkBusq.click();
      await esperar(12000);
    }
    frame = pagina.frames().find((f) => f.url().includes("grid_inventario_stock_new")) || frame;

    // 5. Apretar "Exportar" y luego "Excel"
    log.info("Pidiendo la exportacion a Excel...");
    const btnExportar = frame.locator("#sc_btgp_btn_group_1_top").first();
    if (await btnExportar.count()) await btnExportar.click();
    await esperar(1500);
    const linkExcel = frame.locator("#xls_top").first();
    if (!(await linkExcel.count())) throw new Error("No aparecio el boton Excel en la grilla");
    await linkExcel.click();
    await esperar(6000);

    // 6. En el modal de config, apretar "Aceptar"
    const frameModal = pagina.frames().find((f) => f.url().includes("config_xls"));
    if (!frameModal) throw new Error("No aparecio el modal de exportacion");
    const botonAceptarModal = frameModal.locator("#bok").first();
    if (!(await botonAceptarModal.count())) throw new Error("No aparecio el boton Aceptar en el modal");
    await botonAceptarModal.click();
    await esperar(8000);

    // 7. Encontrar el frame de export_ctrl y el hash del archivo de progreso
    let exportFrame = pagina.frames().find((f) => f.url().includes("export_ctrl"));
    if (!exportFrame) {
      await esperar(5000);
      exportFrame = pagina.frames().find((f) => f.url().includes("export_ctrl"));
    }
    if (!exportFrame) throw new Error("No aparecio la pagina de exportacion");

    const html = await exportFrame.content();
    const matchHash = html.match(/sc_pb_([a-f0-9]+)\.txt/);
    if (!matchHash) throw new Error("No se encontro el hash del archivo de progreso");
    const hash = matchHash[1];
    const urlBase = "http://170.233.219.8:8080";

    // 8. Polling del progreso
    log.info("Esperando que el archivo este listo...");
    let progreso = null;
    const inicio = Date.now();
    const TIMEOUT = 300_000;
    while (Date.now() - inicio < TIMEOUT) {
      try {
        const resp = await pagina.request.get(`${urlBase}/_lib/tmp/sc_pb_${hash}.txt`);
        progreso = await resp.json();
      } catch {
        progreso = null;
      }
      if (progreso) {
        const perc = progreso.count && progreso.steps ? Math.round((progreso.count / progreso.steps) * 100) : 0;
        log.info(`Exportando... ${perc}% ${progreso.message || ""}`.trim());
        if (progreso.complete) break;
      }
      await esperar(5000);
    }
    if (!progreso || !progreso.complete) {
      throw new Error("El archivo no termino de generarse en el CtrCredito (timeout)");
    }

    // 9. Descargar el archivo desde el link
    const linkRelativo = progreso.link;
    if (!linkRelativo) throw new Error("El CtrCredito no devolvio el link del archivo");
    const urlArchivo = new URL(linkRelativo, urlBase).href;
    log.info("Descargando la planilla...");
    const respArchivo = await pagina.request.get(urlArchivo);
    if (!respArchivo.ok()) throw new Error(`Descarga fallo (HTTP ${respArchivo.status()})`);
    const buffer = await respArchivo.body();
    const nombre = path.basename(new URL(urlArchivo).pathname) || `ctrcredito-${Date.now()}.xlsx`;
    const destino = path.join(descargas, `${Date.now()}-${nombre}`);
    fs.writeFileSync(destino, buffer);
    log.ok(`Planilla descargada del CtrCredito: ${destino} (${Math.round(buffer.length / 1024)} KB)`);
    return destino;
  } finally {
    await navegador.close().catch(() => {});
  }
}
