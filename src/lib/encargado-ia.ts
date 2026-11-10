// ═══════════════════════════════════════════════════════════════════
// ENCARGADO DE DISTRIBUCIÓN — CAPA DE IA (Task 160)
//
// Usa NVIDIA NIM (API compatible con OpenAI):
//   POST https://integrate.api.nvidia.com/v1/chat/completions
//   Authorization: Bearer <NVIDIA_API_KEY>
//
// Variables de entorno:
//   NVIDIA_API_KEY   (obligatoria para activar la IA)
//   NVIDIA_MODEL     (opcional; default: meta/llama-3.3-70b-instruct)
//   NVIDIA_BASE_URL  (opcional; default: https://integrate.api.nvidia.com/v1)
//
// La IA NO decide los números: el plan lo calcula el motor determinístico
// (encargado-distribucion.ts). La IA interpreta el plan, prioriza, detecta
// riesgos y redacta el informe. Si la API falla o no hay key, el sistema
// devuelve un análisis determinístico equivalente y NUNCA se queda sin
// funcionar.
// ═══════════════════════════════════════════════════════════════════

import type {
  AnalisisEncargadoIA,
  PlanEncargado,
} from "@/lib/encargado-distribucion";

const MODELO_DEFAULT = "meta/llama-3.3-70b-instruct";
const BASE_URL_DEFAULT = "https://integrate.api.nvidia.com/v1";
const TIMEOUT_MS = 30_000;

function apiKey(): string {
  return String(process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || "").trim();
}

function modelo(): string {
  return String(process.env.NVIDIA_MODEL || MODELO_DEFAULT).trim();
}

function baseUrl(): string {
  return String(process.env.NVIDIA_BASE_URL || BASE_URL_DEFAULT).replace(/\/+$/, "");
}

export function iaConfigurada(): boolean {
  return apiKey().length > 0;
}

function lista(valor: unknown, max = 8): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

function extraerJson(contenido: string): Record<string, unknown> | null {
  const limpio = contenido
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(limpio);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    // La IA a veces agrega una frase antes/después del JSON.
  }
  const i = limpio.indexOf("{");
  const j = limpio.lastIndexOf("}");
  if (i >= 0 && j > i) {
    try {
      const parsed = JSON.parse(limpio.slice(i, j + 1));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

// ─── Respaldo determinístico: misma información, sin IA ───
export function analisisRespaldo(
  plan: PlanEncargado,
  motivo?: string
): AnalisisEncargadoIA {
  const r = plan.resumen;
  const sucursales = plan.sucursales;

  const resumen =
    r.transferencias > 0
      ? `Analicé ${r.productosAnalizados} códigos con stock en ${sucursales.length} sucursales. Detecté ${r.transferencias} transferencias internas para mover ${r.unidades} unidades y emparejar el stock de ${r.productos} códigos.`
      : `Analicé ${r.productosAnalizados} códigos con stock en ${sucursales.length} sucursales. No hay transferencias pendientes: las sucursales están pareadas según su objetivo.`;

  const prioridades = plan.necesidades.slice(0, 6).map((n) => {
    const venta = n.vendido > 0 ? ` · bajó ${n.vendido} desde el último análisis` : "";
    const estado =
      n.faltaSinCubrir > 0
        ? ` · quedan ${n.faltaSinCubrir} sin cubrir`
        : " · el plan la cubre";
    return `${n.sucursal}: ${n.producto} (${n.sku}) — faltaban ${n.falta}${venta}${estado}`;
  });

  const recomendaciones = plan.filas.slice(0, 8).map(
    (f) =>
      `Enviar ${f.cantidad} × ${f.producto} (${f.sku}) desde ${f.origen} a ${f.destino}${
        f.color ? ` · color ${f.color}` : ""
      }.`
  );

  const queda =
    r.faltanteNoCubierto > 0
      ? `Quedan ${r.faltanteNoCubierto} unidades sin cobertura. No se genera compra a proveedor: solo se informa la necesidad.`
      : "Todos los faltantes que se pudieron cubrir con excedentes internos quedaron cubiertos.";

  return {
    activa: false,
    modelo: null,
    resumen,
    prioridades,
    alertas: plan.alertas.slice(0, 8),
    recomendaciones,
    mensaje: `${queda} Este informe es solo de transferencias entre sucursales.`,
    error: motivo,
  };
}

function contextoParaIA(plan: PlanEncargado) {
  return {
    fecha: plan.generadoEn,
    modo: plan.modo,
    sucursales: plan.sucursales,
    depositoCentral: plan.central,
    resumen: plan.resumen,
    balancePorSucursal: plan.balance.map((b) => ({
      sucursal: b.sucursal,
      stockHoy: b.saldoActual,
      objetivo: b.objetivo,
      entradas: b.entradas,
      salidas: b.salidas,
      stockDespues: b.saldoDespues,
      vendidoDesdeUltimoAnalisis: b.vendidoReciente,
      productosBajos: b.productosBajos,
      faltanteSinCobertura: b.faltanteNoCubierto,
    })),
    transferencias: plan.filas.slice(0, 90).map((f) => ({
      codigo: f.sku,
      producto: f.producto,
      tipo: f.tipo,
      color: f.color,
      origen: f.origen,
      destino: f.destino,
      cantidad: f.cantidad,
      saldoOrigen: f.origenSaldo,
      objetivoOrigen: f.origenObjetivo,
      saldoDestino: f.destinoSaldo,
      objetivoDestino: f.destinoObjetivo,
      vendidoOrigen: f.origenVendido,
      vendidoDestino: f.destinoVendido,
      motivo: f.motivo,
    })),
    necesidades: plan.necesidades.slice(0, 50).map((n) => ({
      codigo: n.sku,
      producto: n.producto,
      tipo: n.tipo,
      color: n.color,
      sucursal: n.sucursal,
      stock: n.saldo,
      objetivo: n.objetivo,
      falta: n.falta,
      faltaSinCubrir: n.faltaSinCubrir,
      vendidoDesdeUltimoAnalisis: n.vendido,
    })),
    alertasDelMotor: plan.alertas.slice(0, 20),
  };
}

const SYSTEM_PROMPT = `Sos el ENCARGADO DE DISTRIBUCIÓN de VIZA HOME (Paraguay).
Trabajás dentro del sistema, con stock real por sucursal. Tu única función es
mantener pareado el stock de las 4 sucursales: NUEVA ESPERANZA, KATUETE,
LA PALOMA y SALTOS DEL GUAIRA.

REGLAS QUE NUNCA PODÉS ROMPER:
1. Solo hacés transferencias INTERNAS entre sucursales. NUNCA generás compras
   a proveedores ni órdenes de compra.
2. El stock de CENTRAL es el depósito: solo se usa para reponer una sucursal
   que quedó por debajo de su objetivo.
3. Leés el TIPO de producto, la columna CORES (colores) y la cantidad de
   stock. Si un código tiene varios colores, avisá que hay que cuidar el
   surtido al despachar.
4. Cuando una sucursal bajó su stock desde el último análisis, interpretalo
   como venta/consumo y priorizá reponer esa necesidad.
5. No inventes números: usá EXACTAMENTE las transferencias, saldos y
   faltantes que vienen en el JSON. Si un dato no está, no lo inventes.
6. No prometas acciones que el sistema no hace: el sistema recomienda y
   genera el PDF; el equipo mueve la mercadería.

Respondé SOLO con un objeto JSON válido, sin markdown ni texto extra, con
esta forma exacta:
{
  "resumen": "2 a 4 frases en español, concreto y profesional",
  "prioridades": ["hasta 6 prioridades concretas"],
  "alertas": ["hasta 6 riesgos o datos que el dueño debe saber"],
  "recomendaciones": ["hasta 8 acciones concretas de transferencia"],
  "mensaje": "1 o 2 frases de cierre para el dueño"
}`;

export async function analizarPlanConIA(
  plan: PlanEncargado
): Promise<AnalisisEncargadoIA> {
  const key = apiKey();
  if (!key) {
    return analisisRespaldo(
      plan,
      "NVIDIA_API_KEY no está configurada. Se muestra el análisis determinístico del Encargado."
    );
  }

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: modelo(),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Este es el plan determinístico del Encargado. Interpretalo y redactá el informe:\n${JSON.stringify(
              contextoParaIA(plan)
            )}`,
          },
        ],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 1400,
        stream: false,
      }),
      signal: controlador.signal,
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      return analisisRespaldo(
        plan,
        `NVIDIA NIM respondió HTTP ${respuesta.status}${detalle ? `: ${detalle.slice(0, 220)}` : ""}.`
      );
    }

    const data: any = await respuesta.json().catch(() => null);
    const contenido = texto(
      data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        data?.output_text ??
        ""
    );

    if (!contenido) {
      return analisisRespaldo(plan, "NVIDIA NIM devolvió una respuesta vacía.");
    }

    const json = extraerJson(contenido);
    if (!json) {
      const respaldo = analisisRespaldo(plan);
      return {
        ...respaldo,
        activa: true,
        modelo: modelo(),
        resumen: contenido.slice(0, 1200) || respaldo.resumen,
        error: "La IA respondió en texto libre; se completó con el análisis determinístico.",
      };
    }

    const respaldo = analisisRespaldo(plan);
    return {
      activa: true,
      modelo: modelo(),
      resumen: texto(json.resumen) || respaldo.resumen,
      prioridades: lista(json.prioridades).length ? lista(json.prioridades) : respaldo.prioridades,
      alertas: lista(json.alertas).length ? lista(json.alertas) : respaldo.alertas,
      recomendaciones: lista(json.recomendaciones).length
        ? lista(json.recomendaciones)
        : respaldo.recomendaciones,
      mensaje: texto(json.mensaje) || respaldo.mensaje,
    };
  } catch (error: any) {
    const motivo =
      error?.name === "AbortError"
        ? "La IA tardó más de 30 segundos y se canceló."
        : error?.message || String(error);
    return analisisRespaldo(plan, `No se pudo consultar NVIDIA NIM: ${motivo}`);
  } finally {
    clearTimeout(timer);
  }
}
