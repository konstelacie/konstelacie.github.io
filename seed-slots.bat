@echo off
cd /d "%~dp0"
yarn db:seed-slots
set ERR=%ERRORLEVEL%
pause
exit /b %ERR%