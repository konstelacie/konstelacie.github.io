@echo off
cd /d "%~dp0"
npm run db:reset
exit /b %ERRORLEVEL%
