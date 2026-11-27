// ============================================================================
//  PRUEBA DE EXPORTACION
// ----------------------------------------------------------------------------
//  Corre solo la exportacion del CtrCredito (sin tocar el sistema VIZA).
//  Sirve para verificar que el agente puede obtener la planilla.
//
//  Uso:  npm run exportar
// ============================================================================
import { config } from "./config.mjs";
import { log } from "./logger.mjs";
import { exportarCtrCredito } from "./ctrcredito.mjs";

exportarCtrCredito()
  .then((archivo) => {
    log.ok(`Listo. Planilla en: ${archivo}`);
  })
  .catch((error) => {
    log.error(error?.message || String(error));
    process.exit(1);
  });
