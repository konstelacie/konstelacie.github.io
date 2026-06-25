@echo off
REM LOCAL DEV ONLY — destroys the database. Never use on production (live since 2026-06).
cd /d "%~dp0"
yarn db:reset
set ERR=%ERRORLEVEL%
pause
exit /b %ERR%
