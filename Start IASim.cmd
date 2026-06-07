@echo off
REM Launch the IASim local server and open it in the default browser.
start "" http://localhost:8765/
powershell -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 8765
