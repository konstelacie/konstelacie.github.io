@echo off
setlocal
cd /d "%~dp0"

echo [prod] Creating alwaysdata deploy artifact...
call node scripts/deploy-alwaysdata.js --target=prod
set ERR=%ERRORLEVEL%
if %ERR% NEQ 0 (
  echo [prod] Deploy packaging failed with exit code %ERR%.
  pause
  exit /b %ERR%
)

echo [prod] Deploy artifact is ready in deploy\ folder.
pause
exit /b 0
