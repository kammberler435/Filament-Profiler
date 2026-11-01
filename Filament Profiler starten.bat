@echo off
rem Startet den Filament Profiler: lokaler Node.js-Server (nur 127.0.0.1) + eigenes App-Fenster (Edge/Chrome).
rem Das Konsolenfenster laeuft minimiert und beendet sich, sobald das App-Fenster geschlossen wird.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte von https://nodejs.org installieren.
  pause
  exit /b 1
)
start "Filament Profiler (Server)" /min node server.js --open
