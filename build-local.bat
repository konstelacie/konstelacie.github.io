@echo off
cd /d "%~dp0"

node scripts/build-local.js
set ERR=%ERRORLEVEL%
if %ERR% NEQ 0 exit /b %ERR%

REM Start dev server after local prep.
yarn dev
set ERR=%ERRORLEVEL%
pause
exit /b %ERR%

