# Agente de Stock VIZA HOME

Programa que corre en la PC de la empresa y hace solo lo que antes se hacía a mano:

1. Entra al sistema VIZA.
2. Le avisa al panel que está encendido (heartbeat).
3. Pide el turno (si hay dos PCs, solo una toca el CtrCredito).
4. Obtiene la planilla del inventario del CtrCredito.
5. La manda a **STOCK GENERAL** (preview + apply).
6. Informa cuántos productos se crearon y cuántos se actualizaron.

Con esto el chip del panel deja de decir `PC: sin señal` y pasa a `PC: en línea`.

---

## 1. Requisitos

- Windows 10/11.
- Node.js 20 o superior (`node -v`).
- Estar en la red donde vive el CtrCredito (`170.233.219.8`).
- Un usuario del sistema VIZA con rol **supremo_admin** (la importación lo exige).

## 2. Instalación

```bat
cd agente
npm install
```

Si vas a usar el modo `navegador` (Playwright):

```bat
npx playwright install chromium
```

## 3. Configuración

```bat
copy .env.example .env
```

Completar en `agente\.env`:

| Variable | Qué es |
| --- | --- |
| `VIZA_URL` | `https://sistema.viza.com.py` |
| `VIZA_EMAIL` | usuario del robot (supremo_admin) |
| `VIZA_PASSWORD` | su contraseña |
| `ERP_MODO` | `carpeta`, `http` o `navegador` |
| `ERP_CARPETA` | solo modo `carpeta`: dónde aparece el Excel |
| `ERP_URL` | solo modo `http`: URL que devuelve el Excel |
| `ERP_RECETA` | solo modo `navegador`: JSON con los pasos |

## 4. Cómo obtiene la planilla del CtrCredito

El agente ya conoce el flujo de este CtrCredito (ScriptCase) y lo hace solo:

1. Entra con el usuario/clave del ERP.
2. Abre **Informe de Inventario de Stock**.
3. Pulsa Búsqueda y luego Exportar → Excel → Aceptar.
4. Espera a que el servidor termine de generar el archivo (barra de progreso).
5. Descarga el `.xlsx` y lo importa en STOCK GENERAL.

No hay que tocar ninguna receta JSON.

### Modo `carpeta` (alternativa)

Si preferís, el ERP (o una persona) deja el Excel en `ERP_CARPETA`. El agente toma el archivo más nuevo que todavía no procesó, lo importa y lo mueve a `procesados\`.

No procesa dos veces el mismo archivo: guarda la fecha de modificación en `agente\datos\estado.json`.

### Modo `http`

El ERP entrega el Excel por una URL directa. El agente la descarga y la importa.

Si el ERP pide sesión, se pueden mandar cabeceras con `ERP_HEADERS` (JSON), por ejemplo una cookie.

## 5. Probarlo

Primero un diagnóstico (lee la planilla y muestra qué haría, **sin tocar el stock**):

```bat
npm run diagnostico
```

Una sola vuelta completa, sin esperar horario:

```bat
node src\index.mjs --una-vez --forzar
```

Bucle normal:

```bat
arrancar.bat
```

## 6. Que arranque solo con Windows

```powershell
powershell -ExecutionPolicy Bypass -File agente\instalar-tarea.ps1
```

Crea la tarea `VizaAgenteStock`, que arranca al iniciar sesión y se reinicia si se cae.

## 7. Dónde mirar si algo falla

- `agente\datos\agente.log` — todo lo que hizo el agente.
- Panel → chip `PC:` — dice si está en línea y hace cuánto.
- Panel → botón `ACTUALIZAR` — muestra `EXPORTANDO...`, `LEYENDO...`, `IMPORTANDO...` mientras trabaja.

## 8. Horario

- Corre solo dentro de la ventana `VENTANA_DESDE`–`VENTANA_HASTA` (7 a 18 por defecto).
- Una corrida automática cada `CORRIDA_CADA_MIN` minutos (60 por defecto).
- El botón `ACTUALIZAR` del panel pide una corrida inmediata (vence a los 30 minutos si la PC está apagada).
