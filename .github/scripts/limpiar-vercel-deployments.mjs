#!/usr/bin/env node
// ============================================================
// VIZA HOME - Limpiador de deployments viejos de Vercel (v2)
// ------------------------------------------------------------
// NOVEDAD v2: AUTO-DIAGNOSTICO.
//   - Valida el token y muestra el usuario de Vercel.
//   - Prueba solo las combinaciones (con/sin teamId).
//   - Si el projectId del secret falla, busca el proyecto por
//     nombre y usa el correcto (autocorreccion).
//   - Si nada funciona, escribe en el log un diagnostico claro
//     con la causa mas probable (para corregir de una vez).
//
// QUE HACE: conserva los ultimos 4 deployments (red de rollback)
//   y no borra nada con menos de 3 dias. Borra el resto (copias
//   viejas de codigo que solo ocupan espacio).
// QUE NO HACE: no toca la base de datos (registros, productos,
//   stock), ni el sistema en produccion, ni archivos del repo.
// ============================================================

const TOKEN = (process.env.VERCEL_TOKEN || "").trim();
const PROJECT_ID = (process.env.VERCEL_PROJECT_ID || "").trim();
const TEAM_ID = (process.env.VERCEL_TEAM_ID || "").trim();
const NOMBRE_PROYECTO = "viza-home-sistema";

const MANTENER_ULTIMOS = 4; // siempre conserva los 4 deployments mas recientes
const EDAD_MINIMA_DIAS = 3; // candado: nunca borra nada con menos de 3 dias
const PAGINAS_MAX = 4;      // revisa hasta 400 deployments por corrida

const base = process.env.VERCEL_API_BASE || "https://api.vercel.com";
const MS_DIA = 24 * 60 * 60 * 1000;

if (!TOKEN) { console.error("X Falta el secret VERCEL_TOKEN"); process.exit(1); }
if (!PROJECT_ID) { console.error("X Falta el secret VERCEL_PROJECT_ID (debe empezar con prj_)"); process.exit(1); }

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
  console.log("== Viza Home - limpieza de deployments viejos de Vercel (v2) ==");
  console.log(`Config: conserva los ultimos ${MANTENER_ULTIMOS} | no toca nada con menos de ${EDAD_MINIMA_DIAS} dias`);

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

  let borrados = 0;
  let conservados = 0;
  let errores = 0;

  for (let i = 0; i < todos.length; i++) {
    const d = todos[i];
    const fecha = new Date(d.createdAt).toISOString().slice(0, 10);
    const estado = d.readyState || d.state || "?";
    const info = `${d.uid} | ${fecha} | ${estado}`;

    if (i < MANTENER_ULTIMOS) {
      console.log(`CONSERVAR (ultimo ${i + 1}) ${info}`);
      conservados++;
      continue;
    }
    if (ahora - d.createdAt < edadMinima) {
      console.log(`CONSERVAR (menos de ${EDAD_MINIMA_DIAS} dias) ${info}`);
      conservados++;
      continue;
    }
    try {
      let path = `/v13/deployments/${d.uid}`;
      if (modoConTeam) path += `?teamId=${encodeURIComponent(TEAM_ID)}`;
      await api(path, "DELETE");
      console.log(`BORRADO ${info}`);
      borrados++;
    } catch (e) {
      console.log(`ERROR (se salta) ${info} : ${corto(e.message)}`);
      errores++;
    }
    await new Promise((r) => setTimeout(r, 300)); // respetar limites de la API
  }

  console.log("----------------------------------------------------------");
  console.log(`RESUMEN: ${borrados} borrados | ${conservados} conservados | ${errores} errores`);
  console.log("Listo. Base de datos y sistema en produccion NO fueron tocados.");

  if (borrados === 0 && errores > 0) {
    console.error("No se pudo borrar ninguno: revisa el log de arriba.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`FALLO GENERAL: ${e.message}`);
  process.exit(1);
});
