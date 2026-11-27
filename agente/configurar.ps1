# ============================================================================
#  CONFIGURADOR DEL AGENTE
# ----------------------------------------------------------------------------
#  Pregunta los datos y escribe agente\.env. Ejecutar una vez:
#
#      powershell -ExecutionPolicy Bypass -File agente\configurar.ps1
# ============================================================================
$ErrorActionPreference = "Stop"
$agente = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $agente ".env"

Write-Host ""
Write-Host "=== VIZA AGENTE DE STOCK - CONFIGURACION ===" -ForegroundColor Cyan
Write-Host ""

$vizaUrl = Read-Host "Sistema VIZA [https://sistema.viza.com.py]"
if ([string]::IsNullOrWhiteSpace($vizaUrl)) { $vizaUrl = "https://sistema.viza.com.py" }

$email = Read-Host "Usuario del robot en VIZA (supremo_admin)"
$claveSegura = Read-Host "Clave del robot en VIZA" -AsSecureString
$clave = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($claveSegura)
)

$erpUrl = Read-Host "URL del CtrCredito [http://170.233.219.8:8080/]"
if ([string]::IsNullOrWhiteSpace($erpUrl)) { $erpUrl = "http://170.233.219.8:8080/" }

$erpUsuario = Read-Host "Usuario del CtrCredito"
$erpClaveSegura = Read-Host "Clave del CtrCredito" -AsSecureString
$erpClave = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($erpClaveSegura)
)

$carpeta = Read-Host "Carpeta de planillas [C:\Viza\exportaciones]"
if ([string]::IsNullOrWhiteSpace($carpeta)) { $carpeta = "C:\Viza\exportaciones" }
New-Item -ItemType Directory -Force -Path $carpeta | Out-Null

$contenido = @"
# Generado por configurar.ps1
VIZA_URL=$vizaUrl
VIZA_EMAIL=$email
VIZA_PASSWORD=$clave
PC_NOMBRE=
INTERVALO_SEG=60
VENTANA_DESDE=7
VENTANA_HASTA=21
CORRIDA_CADA_MIN=60

ERP_MODO=navegador
ERP_CARPETA=$carpeta
ERP_PATRON=*.xlsx,*.xlsm,*.xls
ERP_MOVER_DESPUES=true
ERP_URL=
ERP_HEADERS=
ERP_RECETA=agente/recetas/ctrcredito.json
ERP_USUARIO=$erpUsuario
ERP_CLAVE=$erpClave
ERP_MOSTRAR_NAVEGADOR=false
ERP_URL_LOGIN=$erpUrl
ERP_NAVEGADOR_CANAL=msedge

AGENTE_DIR=agente/datos
"@

Set-Content -Path $envFile -Value $contenido -Encoding UTF8
Write-Host ""
Write-Host "Guardado en $envFile" -ForegroundColor Green
Write-Host "Ahora proba:  node src\index.mjs --una-vez --forzar --diagnostico"
