@echo off
cd /d "%~dp0"
npm run db:seed-slots
exit /b %ERRORLEVEL%
