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

    // 3. Planilla
    await cliente.avisarEtapa("exportando", "Buscando la planilla del CtrCredito");
    // Si la exportacion tarda, seguimos mandando senal de vida cada 2 minutos
    // para que el panel no muestre "PC sin senal" en el medio.
    const latido = setInterval(() => {
      cliente.avisarEtapa("exportando", "Exportando del CtrCredito").catch(() => {});
    }, 120_000);
    let planilla;
    try {
      planilla = await obtenerPlanilla();
    } finally {
      clearInterval(latido);
    }
    if (!planilla) {
      const eraPedido = Boolean(cfg.pedidoManual);
      log.aviso("No hay planilla nueva para importar. Se reintenta en la proxima vuelta.");
      await cliente.avisarEtapa("", "Esperando planilla del ERP");
      if (eraPedido) {
        // El duenio apreto ACTUALIZAR y la PC esta en linea, pero no hay
        // archivo: avisamos claro en vez de dejarlo esperando 3 minutos.
        await cliente.resultado({
          ok: false,
          nuevos: 0,
          actualizados: 0,
          mensaje: "No hay planilla nueva del ERP para importar (revisa la exportacion).",
        });
      }
      return;
    }

    // 4. Preview
    await cliente.avisarEtapa("preview", "Leyendo la planilla");
    log.info("Subiendo planilla para la vista previa...");
    const preview = await cliente.preview(planilla.archivo);
    if (!preview?.codigosUnicos) {
      throw new Error("La planilla no tiene codigos validos (revisa que sea el inventario correcto)");
    }
    log.info(
      `Preview: ${preview.codigosUnicos} codigos · ${preview.nuevosCount} nuevos · ${preview.actualizadosCount} actualizados`
    );
    for (const aviso of preview.errores || []) log.aviso(`Preview: ${aviso}`);

    // Diagnostico: lee todo pero NO toca el stock.
    if (DIAGNOSTICO) {
      log.ok(
        `Diagnostico OK: ${preview.codigosUnicos} codigos leidos (${preview.nuevosCount} nuevos, ${preview.actualizadosCount} actualizados). No se importo nada.`
      );
      await cliente.avisarEtapa("", "Diagnostico terminado (no se importo nada)");
      return;
    }

    // 5. Aplicar
    await cliente.avisarEtapa("aplicando", "Importando en STOCK GENERAL");
    log.info("Aplicando la importacion...");
    const resultado = await cliente.aplicar(preview);

    // 6. Informar
    const partes = [
      `${resultado.creados ?? 0} nuevos`,
      `${resultado.actualizados ?? 0} actualizados`,
    ];
    if (resultado.conCostoActualizado) partes.push(`${resultado.conCostoActualizado} con costo nuevo`);
    if (resultado.costosProtegidos) partes.push(`${resultado.costosProtegidos} con costo protegido`);
    const mensaje = partes.join(" · ");

    await cliente.resultado({
      ok: true,
      nuevos: resultado.creados ?? 0,
      actualizados: resultado.actualizados ?? 0,
      mensaje,
    });
    marcarProcesada(planilla);
    log.ok(`Importacion terminada: ${mensaje}`);
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
