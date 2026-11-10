#!/usr/bin/env node
import { appendFileSync } from "node:fs";

// ============================================================
// VIZA HOME - Limpiador de deployments viejos de Vercel (v4)
// ------------------------------------------------------------
// NOVEDAD v4: RESUMEN VISIBLE EN LA PAGINA DEL RUN.
//   Al terminar escribe una tabla en "Summary" de GitHub Actions
//   (cuantos reviso, cuantos borro, cuantos conservo, errores y
//   la lista de los borrados). Asi no hay que bucear en el log.
//
// NOVEDAD v2: AUTO-DIAGNOSTICO.
//   - Valida el token y muestra el usuario de Vercel.
//   - Prueba solo las combinaciones (con/sin teamId).
//   - Si el projectId del secret falla, busca el proyecto por
//     nombre y usa el correcto (autocorreccion).
//   - Si nada funciona, escribe en el log un diagnostico claro
//     con la causa mas probable (para corregir de una vez).
//
// QUE HACE: conserva SIEMPRE los ultimos 5 deployments (red de
//   rollback) y no borra nada con menos de 1 dia. Borra el resto
//   (copias viejas de codigo que solo ocupan espacio).
//   Corre TODOS LOS DIAS (ver limpiar-deployments-vercel.yml).
// REGLA FIJA: nunca se borran los 5 mas recientes, pase lo que pase.
//   Tampoco se borra el deployment de PRODUCCION que esta sirviendo.
// QUE NO HACE: no toca la base de datos (registros, productos,
//   stock), ni el sistema en produccion, ni archivos del repo.
// ============================================================

const TOKEN = (process.env.VERCEL_TOKEN || "").trim();
const PROJECT_ID = (process.env.VERCEL_PROJECT_ID || "").trim();
const TEAM_ID = (process.env.VERCEL_TEAM_ID || "").trim();
const NOMBRE_PROYECTO = "viza-home-sistema";

const MANTENER_ULTIMOS = 5; // REGLA FIJA: siempre conserva los 5 deployments mas recientes
const EDAD_MINIMA_DIAS = 1; // candado: nunca borra nada con menos de 1 dia
const PAGINAS_MAX = 4;      // revisa hasta 400 deployments por corrida

const base = process.env.VERCEL_API_BASE || "https://api.vercel.com";
const MS_DIA = 24 * 60 * 60 * 1000;

// ---------- Resumen visible en la pagina del run (GitHub Summary) ----------
const RESUMEN_ARCHIVO = process.env.GITHUB_STEP_SUMMARY || "";
function resumen(linea = "") {
  if (!RESUMEN_ARCHIVO) return;
  try {
    appendFileSync(RESUMEN_ARCHIVO, linea + "\n");
  } catch {
    /* si falla el resumen, el run sigue igual */
  }
}

// Datos que se muestran al final
const informe = {
  revisados: 0,
  borrados: [],
  conservadosUltimos: 0,
  conservadosProduccion: 0,
  conservadosNuevos: 0,
  errores: [],
  produccion: "",
  problema: "",
};

function horaUTC(ms = Date.now()) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function escribirResumen() {
  const borrados = informe.borrados;
  resumen("# Limpieza automatica de deployments (Vercel)");
  resumen();
  resumen(`| Dato | Valor |`);
  resumen(`| --- | --- |`);
  resumen(`| Corrida | ${horaUTC()} |`);
  resumen(`| Deployments revisados | **${informe.revisados}** |`);
  resumen(`| **Borrados** | **${borrados.length}** |`);
  resumen(`| Conservados: los 5 ultimos | ${informe.conservadosUltimos} |`);
  resumen(`| Conservados: produccion en vivo | ${informe.conservadosProduccion} |`);
  resumen(`| Conservados: menos de ${EDAD_MINIMA_DIAS} dia(s) | ${informe.conservadosNuevos} |`);
  resumen(`| Errores | ${informe.errores.length} |`);
  if (informe.produccion) resumen(`| Produccion protegida | \`${informe.produccion}\` |`);
  resumen();

  if (informe.problema) {
    resumen(`## No se pudo limpiar`);
    resumen();
    resumen(informe.problema);
    resumen();
    resumen("Tus datos, la base de datos y el sistema en produccion NO fueron tocados.");
    return;
  }

  resumen(`## Borrados (${borrados.length})`);
  resumen();
  if (borrados.length === 0) {
    resumen("Ninguno. No habia deployments con mas de " + EDAD_MINIMA_DIAS + " dia fuera de los 5 ultimos.");
  } else {
    resumen("| # | Deployment | Fecha | Estado |");
    resumen("| --- | --- | --- | --- |");
    const MAX = 60;
    borrados.slice(0, MAX).forEach((d, i) => {
      resumen(`| ${i + 1} | \`${d.uid}\` | ${d.fecha} | ${d.estado} |`);
    });
    if (borrados.length > MAX) resumen(`\n... y ${borrados.length - MAX} mas (ver el log completo).`);
  }

  if (informe.errores.length > 0) {
    resumen();
    resumen(`## Errores (${informe.errores.length})`);
    resumen();
    informe.errores.slice(0, 20).forEach((e) => resumen(`- \`${e.uid}\` (${e.fecha}): ${e.motivo}`));
  }
}

if (!TOKEN) {
  console.error("X Falta el secret VERCEL_TOKEN");
  informe.problema = "Falta el secret `VERCEL_TOKEN` en GitHub (Settings -> Secrets and variables -> Actions).";
  escribirResumen();
  process.exit(1);
}
if (!PROJECT_ID) {
  console.error("X Falta el secret VERCEL_PROJECT_ID (debe empezar con prj_)");
  informe.problema = "Falta el secret `VERCEL_PROJECT_ID` en GitHub.";
  escribirResumen();
  process.exit(1);
}

async function api(path, method = "GET", reintento = 0) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (res.status === 429 && reintento < 3) {
    const espera = Number(res.headers.get("retry-after") || "5");
    await new Promise((r) => setTimeout(r, espera * 1000));
    return api(path, method, reintento + 1);
  }
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`${method} ${path.split("?")[0]} -> HTTP ${res.status} ${texto.slice(0, 160)}`);
  }
  return res.status === 204 ? null : res.json();
}

function corto(msg) { return String(msg).slice(0, 140); }

async function probarListado(query) {
  try {
    const d = await api(`/v6/deployments?${query}&limit=1`);
    return d.deployments || [];
  } catch (e) {
    console.log(`   -> fallo: ${corto(e.message)}`);
    return null;
  }
}

async function main() {
  console.log("== Viza Home - limpieza de deployments viejos de Vercel (v4 - diaria) ==");
  console.log(`Config: conserva los ultimos ${MANTENER_ULTIMOS} | no toca nada con menos de ${EDAD_MINIMA_DIAS} dia(s)`);
  // ---- FASE 1: validar el token ----
  try {
    const u = await api("/v2/user");
    const username = u && u.user ? u.user.username : "(desconocido)";
    console.log(`FASE 1: token valido. Usuario de Vercel: ${username}`);
  } catch (e) {
    console.log(`FASE 1: el token NO se pudo validar: ${corto(e.message)}`);
    console.log("   -> Causa tipica: el secret VERCEL_TOKEN esta vacio, mal pegado, o el token fue borrado.");
    console.log("      Crea el token en https://vercel.com/account/settings/tokens (scope FULL ACCOUNT)");
    console.log("      y pegalo en el secret VERCEL_TOKEN con el lapiz.");
  }

  // ---- FASE 2: encontrar la combinacion que funciona ----
  const combos = [];
  if (TEAM_ID) {
    combos.push({ label: "projectId del secret + teamId", query: `projectId=${encodeURIComponent(PROJECT_ID)}&teamId=${encodeURIComponent(TEAM_ID)}` });
  }
  combos.push({ label: "projectId del secret, sin teamId", query: `projectId=${encodeURIComponent(PROJECT_ID)}` });

  let deployments = null;
  let modoQuery = null;
  let modoConTeam = false;

  for (const c of combos) {
    console.log(`FASE 2: probando ${c.label}...`);
    const r = await probarListado(c.query);
    if (r) {
      deployments = r;
      modoQuery = c.query;
      modoConTeam = c.query.includes("teamId=");
      console.log(`   -> FUNCIONO con: ${c.label}`);
      break;
    }
  }

  // Ultimo recurso: buscar el proyecto por nombre (autocorreccion)
  if (!deployments) {
    console.log("FASE 2: buscando el proyecto por nombre (autocorreccion)...");
    const combosProyectos = [];
    if (TEAM_ID) combosProyectos.push({ label: "con teamId", qs: `teamId=${encodeURIComponent(TEAM_ID)}` });
    combosProyectos.push({ label: "sin teamId", qs: "" });
    for (const cp of combosProyectos) {
      try {
        const d = await api(`/v9/projects?${cp.qs}&limit=100`);
        const lista = d.projects || [];
        console.log(`   -> proyectos accesibles ${cp.label}: ${lista.map((p) => p.name).join(", ") || "(ninguno)"}`);
        const p = lista.find((x) => x.name === NOMBRE_PROYECTO) || (lista.length === 1 ? lista[0] : null);
        if (!p) continue;
        console.log(`   -> usando proyecto: ${p.name} (${p.id})`);
        const q = `projectId=${p.id}${cp.qs ? "&" + cp.qs : ""}`;
        const r = await probarListado(q);
        if (r) {
          deployments = r;
          modoQuery = q;
          modoConTeam = Boolean(cp.qs);
          console.log("   -> FUNCIONO con el proyecto encontrado por nombre");
          break;
        }
      } catch (e) {
        console.log(`   -> /v9/projects ${cp.label} fallo: ${corto(e.message)}`);
      }
    }
  }

  if (!deployments) {
    console.log("----------------------------------------------------------");
    console.log("DIAGNOSTICO FINAL: ninguna combinacion fue autorizada por Vercel.");
    console.log("Causas mas probables (en orden):");
    console.log("  1) El secret VERCEL_TOKEN no tiene scope FULL ACCOUNT (Vercel respondio 403 Not authorized).");
    console.log("     Crealo en https://vercel.com/account/settings/tokens eligiendo FULL ACCOUNT.");
    console.log("  2) El secret VERCEL_TOKEN sigue con el token viejo: editalo con el lapiz y pega el token nuevo.");
    console.log("  3) El secret VERCEL_PROJECT_ID no corresponde (la lista de proyectos accesibles de arriba");
    console.log("     muestra los nombres e IDs reales).");
    console.log("Tus datos y tu sistema NO fueron tocados. No se borro nada.");
    informe.problema =
      "Ninguna combinacion fue autorizada por Vercel. Revisa: (1) el secret `VERCEL_TOKEN` debe tener scope **FULL ACCOUNT**; (2) que no sea un token viejo/borrado; (3) que `VERCEL_PROJECT_ID` sea el correcto. El log trae los proyectos accesibles con sus IDs reales.";
    escribirResumen();
    process.exit(1);
  }

  // ---- FASE 3: listar todo y limpiar ----
  const ahora = Date.now();
  const edadMinima = EDAD_MINIMA_DIAS * MS_DIA;

  const todos = [];
  let until = 0;
  for (let pagina = 0; pagina < PAGINAS_MAX; pagina++) {
    let path = `/v6/deployments?${modoQuery}&limit=100`;
    if (until) path += `&until=${until}`;
    const d = await api(path);
    const lista = d.deployments || [];
    todos.push(...lista);
    if (lista.length < 100) break;
    until = Math.min(...lista.map((x) => x.createdAt));
  }
  todos.sort((a, b) => b.createdAt - a.createdAt);
  console.log(`Deployments encontrados: ${todos.length}`);
  informe.revisados = todos.length;

  // Red de seguridad extra: el deployment de PRODUCCION que esta sirviendo
  // el dominio nunca se borra, aunque quede fuera de los 5 mas recientes.
  const produccion = todos.find((d) => d.target === "production");
  if (produccion) {
    informe.produccion = produccion.uid;
    console.log(`Produccion protegida: ${produccion.uid} | ${new Date(produccion.createdAt).toISOString().slice(0, 10)}`);
  }

  for (let i = 0; i < todos.length; i++) {
    const d = todos[i];
    const fecha = new Date(d.createdAt).toISOString().slice(0, 10);
    const estado = d.readyState || d.state || "?";
    const info = `${d.uid} | ${fecha} | ${estado}`;

    if (i < MANTENER_ULTIMOS) {
      console.log(`CONSERVAR (ultimo ${i + 1}) ${info}`);
      informe.conservadosUltimos++;
      continue;
    }
    if (produccion && d.uid === produccion.uid) {
      console.log(`CONSERVAR (produccion en vivo) ${info}`);
      informe.conservadosProduccion++;
      continue;
    }
    if (ahora - d.createdAt < edadMinima) {
      console.log(`CONSERVAR (menos de ${EDAD_MINIMA_DIAS} dias) ${info}`);
      informe.conservadosNuevos++;
      continue;
    }
    try {
      let path = `/v13/deployments/${d.uid}`;
      if (modoConTeam) path += `?teamId=${encodeURIComponent(TEAM_ID)}`;
      await api(path, "DELETE");
      console.log(`BORRADO ${info}`);
      informe.borrados.push({ uid: d.uid, fecha, estado });
    } catch (e) {
      console.log(`ERROR (se salta) ${info} : ${corto(e.message)}`);
      informe.errores.push({ uid: d.uid, fecha, motivo: corto(e.message) });
    }
    await new Promise((r) => setTimeout(r, 300)); // respetar limites de la API
  }

  const conservados =
    informe.conservadosUltimos + informe.conservadosProduccion + informe.conservadosNuevos;
  console.log("----------------------------------------------------------");
  console.log(
    `RESUMEN: ${informe.borrados.length} borrados | ${conservados} conservados | ${informe.errores.length} errores`
  );
  console.log("Listo. Base de datos y sistema en produccion NO fueron tocados.");
  escribirResumen();

  if (informe.borrados.length === 0 && informe.errores.length > 0) {
    console.error("No se pudo borrar ninguno: revisa el log de arriba.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`FALLO GENERAL: ${e.message}`);
  informe.problema = `Fallo general: ${e.message}`;
  escribirResumen();
  process.exit(1);
});
