@echo off
setlocal
cd /d "%~dp0"

echo [prod] Preparing upload build (NODE_ENV=production)...
set "NODE_ENV=production"

call yarn install --production=true --frozen-lockfile
set ERR=%ERRORLEVEL%
if %ERR% NEQ 0 (
  echo [prod] Build failed with exit code %ERR%.
  pause
  exit /b %ERR%
)

echo [prod] Build ready for alwaysdata upload.
pause
exit /b 0
