@echo off
REM ============================================================================
REM  VIZA AGENTE DE STOCK - arranque manual
REM  Deja esta ventana abierta. Para que arranque solo con Windows, usar
REM  instalar-tarea.ps1 (una sola vez).
REM ============================================================================
cd /d "%~dp0"
node src\index.mjs
pause
