// ============================================================================
//  VIZA AGENTE DE STOCK
// ----------------------------------------------------------------------------
//  Corre en la PC de la empresa. Cada minuto:
//    1. Deja el heartbeat y lee la configuracion del panel.
//    2. Pide el turno (si hay otra PC activa, espera).
//    3. Si corresponde, exporta el CtrCredito e importa la planilla.
//    4. Informa el resultado al panel.
//
//  Uso:
//    node src/index.mjs              -> bucle normal
//    node src/index.mjs --una-vez    -> una vuelta y sale (para probar)
//    node src/index.mjs --forzar     -> corre ya, sin esperar horario/pedido
// ============================================================================
import { config, validarConfig } from "./config.mjs";
import { log } from "./logger.mjs";
import { VizaClient } from "./viza.mjs";
import { obtenerPlanilla, marcarProcesada } from "./erp.mjs";

const UNA_VEZ = process.argv.includes("--una-vez");
const FORZAR = process.argv.includes("--forzar");
const DIAGNOSTICO = process.argv.includes("--diagnostico");

const cliente = new VizaClient();
let corriendo = false;
let detener = false;

function enVentana(ahora = new Date()) {
  const h = ahora.getHours() + ahora.getMinutes() / 60;
  const { ventanaDesde: desde, ventanaHasta: hasta } = config;
  if (desde === hasta) return true;
  if (desde < hasta) return h >= desde && h < hasta;
  return h >= desde || h < hasta; // ventana que cruza medianoche
}

function tocaCorrida(cfg, ahora = new Date()) {
  if (!cfg?.habilitado) return { si: false, motivo: "stock automatico pausado" };
  if (!enVentana(ahora)) return { si: false, motivo: "fuera de la ventana horaria" };

  const pedido = cfg.pedidoManual ? new Date(cfg.pedidoManual).getTime() : 0;
  if (pedido && Number.isFinite(pedido) && Date.now() - pedido < 30 * 60 * 1000) {
    return { si: true, motivo: "pedido manual" };
  }

  const ultima = cfg.ultimaCorrida ? new Date(cfg.ultimaCorrida).getTime() : 0;
  const desdeUltima = Number.isFinite(ultima) && ultima > 0 ? Date.now() - ultima : Infinity;
  if (desdeUltima >= config.corridaCadaMs) {
    return { si: true, motivo: "corrida horaria" };
  }

  const faltan = Math.ceil((config.corridaCadaMs - desdeUltima) / 60000);
  return { si: false, motivo: `proxima corrida en ${faltan} min` };
}

async function correrCiclo() {
  if (corriendo) return;
  corriendo = true;
  try {
    // 1. Heartbeat + configuracion
    const cfg = await cliente.heartbeat();
    const decision = FORZAR
      ? { si: true, motivo: "forzado a mano" }
      : tocaCorrida(cfg);
    log.info(`Heartbeat OK. ${decision.si ? "Corriendo: " + decision.motivo : "En espera: " + decision.motivo}`);

    if (!decision.si) return;

    // 2. Turno (una sola PC puede tocar el CtrCredito)
    const turno = await cliente.pedirTurno();
    if (turno.activo !== true) {
      log.aviso(
        `Otra PC tiene el turno (${turno.pcActiva || "desconocida"}). Esta PC espera.`
      );
      return;
    }

    // 3. Dos pasadas:
    //    (a) "default" -> productos con stock > 0 (filtro original del reporte)
    //    (b) "cero"    -> productos con stock 0 (para actualizarlos a 0 y
    //                     eliminar los < 100.000)
    const totales = {
      creados: 0,
      actualizados: 0,
      eliminados: 0,
      omitidos: 0,
      conCosto: 0,
      protegidos: 0,
      puestosEnCero: 0,
    };

    for (const filtro of ["default"]) {
      const etiqueta = filtro === "cero" ? "sin stock" : "con stock";
      await cliente.avisarEtapa("exportando", `Exportando productos ${etiqueta}`);

      const latido = setInterval(() => {
        cliente.avisarEtapa("exportando", `Exportando productos ${etiqueta}`).catch(() => {});
      }, 120_000);
      let planilla;
      try {
        planilla = await obtenerPlanilla(filtro);
      } finally {
        clearInterval(latido);
      }
      if (!planilla) {
        log.aviso(`No hay planilla (${etiqueta}). Se reintenta en la proxima vuelta.`);
        await cliente.avisarEtapa("", "Esperando planilla del ERP");
        if (filtro === "default" && cfg.pedidoManual) {
          await cliente.resultado({
            ok: false,
            nuevos: 0,
            actualizados: 0,
            mensaje: "No hay planilla nueva del ERP para importar (revisa la exportacion).",
          });
        }
        continue;
      }

      await cliente.avisarEtapa("preview", `Leyendo planilla ${etiqueta}`);
      log.info(`Subiendo planilla (${etiqueta}) para la vista previa...`);
      const preview = await cliente.preview(planilla.archivo);
      if (!preview?.codigosUnicos) {
        throw new Error("La planilla no tiene codigos validos (revisa que sea el inventario correcto)");
      }
      log.info(
        `Preview ${etiqueta}: ${preview.codigosUnicos} codigos · ${preview.nuevosCount} nuevos · ${preview.actualizadosCount} actualizados`
      );
      if (preview.eliminadosCount) {
        log.info(`Se eliminaran ${preview.eliminadosCount} codigos < 100.000 con stock 0`);
      }
      for (const aviso of preview.errores || []) log.aviso(`Preview: ${aviso}`);

      if (DIAGNOSTICO) {
        log.ok(
          `Diagnostico (${etiqueta}): ${preview.codigosUnicos} codigos leidos. No se importo nada.`
        );
        await cliente.avisarEtapa("", "Diagnostico terminado (no se importo nada)");
        continue;
      }

      await cliente.avisarEtapa("aplicando", `Importando productos ${etiqueta}`);
      log.info(`Aplicando la importacion (${etiqueta})...`);
      const resultado = await cliente.aplicar(preview);

      // DEBUG: mostrar la respuesta completa del apply
      log.info(`APPLY RESPONSE: ${JSON.stringify(resultado)}`);

      totales.creados += resultado.creados ?? 0;
      totales.actualizados += resultado.actualizados ?? 0;
      totales.eliminados += resultado.eliminados ?? 0;
      totales.omitidos += resultado.omitidos ?? 0;
      totales.conCosto += resultado.conCostoActualizado ?? 0;
      totales.protegidos += resultado.costosProtegidos ?? 0;
      totales.puestosEnCero += resultado.puestosEnCero ?? 0;

      marcarProcesada(planilla);
      log.ok(
        `Importacion (${etiqueta}) terminada: ${resultado.creados ?? 0} nuevos · ${resultado.actualizados ?? 0} actualizados · ${resultado.eliminados ?? 0} eliminados · huerfanos=${resultado.huerfanosCount ?? 0} · enCero=${resultado.puestosEnCero ?? 0}`
      );
    }

    // 6. Informar (una sola vez, con los totales de ambas pasadas)
    const partes = [`${totales.creados} nuevos`, `${totales.actualizados} actualizados`];
    if (totales.eliminados) partes.push(`${totales.eliminados} eliminados`);
    if (totales.omitidos) partes.push(`${totales.omitidos} omitidos`);
    if (totales.puestosEnCero) partes.push(`${totales.puestosEnCero} puestos en cero`);
    if (totales.conCosto) partes.push(`${totales.conCosto} con costo nuevo`);
    if (totales.protegidos) partes.push(`${totales.protegidos} con costo protegido`);
    const mensaje = partes.join(" · ");

    await cliente.resultado({
      ok: true,
      nuevos: totales.creados,
      actualizados: totales.actualizados,
      eliminados: totales.eliminados,
      mensaje,
    });
    await cliente.avisarEtapa("", "Importacion terminada");
    log.ok(`Importacion completa: ${mensaje}`);
  } catch (error) {
    const mensaje = error?.message || String(error);
    log.error(mensaje);
    try {
      await cliente.resultado({ ok: false, nuevos: 0, actualizados: 0, mensaje });
    } catch (error2) {
      log.error(`Tampoco se pudo informar el error: ${error2?.message || error2}`);
    }
  } finally {
    corriendo = false;
  }
}

async function main() {
  const faltan = validarConfig();
  if (faltan.length) {
    log.error(`Falta configuracion: ${faltan.join(", ")}`);
    log.error("Copia agente/.env.example a agente/.env y completalo.");
    process.exit(1);
  }

  log.info("============================================================");
  log.info(`Viza Agente de Stock · PC: ${config.pcNombre}`);
  log.info(`Sistema: ${config.vizaUrl}`);
  log.info(`ERP: modo ${config.erpModo}${config.erpCarpeta ? " · " + config.erpCarpeta : ""}`);
  log.info(`Ventana: ${config.ventanaDesde}:00 a ${config.ventanaHasta}:00 · cada ${Math.round(config.corridaCadaMs / 60000)} min`);
  log.info("============================================================");

  await cliente.login().catch((error) => {
    log.error(`No se pudo entrar al sistema: ${error.message}`);
  });

  if (UNA_VEZ || FORZAR) {
    await correrCiclo();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    detener = true;
    log.info("Cerrando el agente...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    detener = true;
    log.info("Cerrando el agente...");
    process.exit(0);
  });

  while (!detener) {
    await correrCiclo();
    if (detener) break;
    await new Promise((r) => setTimeout(r, config.intervaloMs));
  }
}

main().catch((error) => {
  log.error(`El agente se detuvo: ${error?.message || error}`);
  process.exit(1);
});
