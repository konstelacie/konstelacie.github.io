@echo off
cd /d "%~dp0"
npm run db:seed-slots
set ERR=%ERRORLEVEL%
pause
exit /b %ERR%