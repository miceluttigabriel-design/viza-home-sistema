#!/usr/bin/env node
// ============================================================
// VIZA HOME - Limpiador de deployments viejos de Vercel
// ------------------------------------------------------------
// QUE HACE:
//   - Lista los deployments (copias de codigo) del proyecto en Vercel.
//   - Conserva SIEMPRE los ultimos N deployments (red de rollback).
//   - Nunca borra nada con menos de EDAD_MINIMA_DIAS dias (candado).
//   - Borra el resto: son copias viejas que solo ocupan espacio.
//
// QUE NO HACE:
//   - NO toca la base de datos (registros, productos, presupuestos, stock).
//   - NO toca el sistema en produccion (la pagina sigue funcionando igual).
//   - NO borra ni cambia archivos del repositorio de GitHub.
// ============================================================

const TOKEN = (process.env.VERCEL_TOKEN || "").trim();
const PROJECT_ID = (process.env.VERCEL_PROJECT_ID || "").trim();
// Opcional: solo si la cuenta de Vercel es de EQUIPO. Cuenta personal = vacio.
const TEAM_ID = (process.env.VERCEL_TEAM_ID || "").trim();

const MANTENER_ULTIMOS = 4; // siempre conserva los 4 deployments mas recientes
const EDAD_MINIMA_DIAS = 3; // candado: nunca borra nada con menos de 3 dias
const PAGINAS_MAX = 4;      // revisa hasta 400 deployments por corrida

const base = "https://api.vercel.com";
const MS_DIA = 24 * 60 * 60 * 1000;

if (!TOKEN) { console.error("X Falta el secret VERCEL_TOKEN"); process.exit(1); }
if (!PROJECT_ID) { console.error("X Falta el secret VERCEL_PROJECT_ID"); process.exit(1); }

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
    throw new Error(`${method} ${path.split("?")[0]} -> HTTP ${res.status} ${texto.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function listarDeployments() {
  const todos = [];
  let until = 0;
  for (let pagina = 0; pagina < PAGINAS_MAX; pagina++) {
    let path = `/v6/deployments?projectId=${encodeURIComponent(PROJECT_ID)}&limit=100`;
    if (TEAM_ID) path += `&teamId=${encodeURIComponent(TEAM_ID)}`;
    if (until) path += `&until=${until}`;
    const data = await api(path);
    const lista = data.deployments || [];
    todos.push(...lista);
    if (lista.length < 100) break;
    until = Math.min(...lista.map((d) => d.createdAt));
  }
  return todos;
}

async function main() {
  console.log("== Viza Home - limpieza de deployments viejos de Vercel ==");
  console.log(`Config: conserva los ultimos ${MANTENER_ULTIMOS} | no toca nada con menos de ${EDAD_MINIMA_DIAS} dias`);

  const ahora = Date.now();
  const edadMinima = EDAD_MINIMA_DIAS * MS_DIA;

  const deployments = (await listarDeployments()).sort((a, b) => b.createdAt - a.createdAt);
  console.log(`Deployments encontrados: ${deployments.length}`);

  let borrados = 0;
  let conservados = 0;
  let errores = 0;

  for (let i = 0; i < deployments.length; i++) {
    const d = deployments[i];
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
      if (TEAM_ID) path += `?teamId=${encodeURIComponent(TEAM_ID)}`;
      await api(path, "DELETE");
      console.log(`BORRADO ${info}`);
      borrados++;
    } catch (e) {
      console.log(`ERROR (se salta) ${info} : ${e.message}`);
      errores++;
    }
    await new Promise((r) => setTimeout(r, 300)); // respetar limites de la API
  }

  console.log("----------------------------------------------------------");
  console.log(`RESUMEN: ${borrados} borrados | ${conservados} conservados | ${errores} errores`);
  console.log("Listo. Base de datos y sistema en produccion NO fueron tocados.");

  if (borrados === 0 && errores > 0) {
    console.error("No se pudo borrar ninguno: revisa el token y los permisos.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`FALLO GENERAL: ${e.message}`);
  process.exit(1);
});
