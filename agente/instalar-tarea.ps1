# ============================================================================
#  VIZA AGENTE DE STOCK - tarea de Windows
# ----------------------------------------------------------------------------
#  Registra el agente para que arranque solo al iniciar sesion y se reinicie
#  si se cae. Ejecutar UNA vez, en PowerShell:
#
#      powershell -ExecutionPolicy Bypass -File agente\instalar-tarea.ps1
#
#  Para quitarla:
#      Unregister-ScheduledTask -TaskName "VizaAgenteStock" -Confirm:$false
# ============================================================================
$ErrorActionPreference = "Stop"

$agente = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $agente "src\index.mjs"
$nombre = "VizaAgenteStock"

if (-not (Test-Path $script)) {
  throw "No encuentro $script"
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw "No encuentro Node.js en el PATH. Instalalo o agrega C:\Users\<usuario>\node al PATH."
}

$accion = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $agente
$disparador = New-ScheduledTaskTrigger -AtLogOn
$ajustes = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -RestartCount 10 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit (New-TimeSpan -Days 0)

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparador -Settings $ajustes -Force | Out-Null
Write-Host "Listo. La tarea '$nombre' arranca el agente al iniciar sesion." -ForegroundColor Green
Write-Host "Log: $agente\datos\agente.log"
