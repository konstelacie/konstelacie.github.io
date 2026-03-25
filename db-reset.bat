@echo off
cd /d "%~dp0"
npm run db:reset
set ERR=%ERRORLEVEL%
pause
exit /b %ERR%
