@echo off
setlocal
cd /d "%~dp0"
set PORT=8080
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if not "%%A"=="" if not "%%B"=="" set "%%A=%%B"
  )
)
start "" http://localhost:%PORT%/index.html
node server.js
