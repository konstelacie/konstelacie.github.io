@echo off
cd /d "%~dp0.."
node scripts/seed-slots.js
exit /b %ERRORLEVEL%
