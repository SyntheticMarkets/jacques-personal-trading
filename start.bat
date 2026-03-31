@echo off
setlocal
cd /d "%~dp0"
set PORT=8080
start "" http://localhost:%PORT%/index.html
python -m http.server %PORT%
