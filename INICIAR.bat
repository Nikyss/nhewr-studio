@echo off
setlocal
title Nhewr Studios V1.0.4
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar.ps1" %*
if errorlevel 1 (
  echo.
  echo Nao foi possivel iniciar. Confira a mensagem acima.
  pause
  exit /b 1
)
endlocal
exit /b 0
