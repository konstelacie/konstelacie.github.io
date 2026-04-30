@echo off
cd /d "%~dp0"
yarn db:reset
set ERR=%ERRORLEVEL%
pause
exit /b %ERR%
