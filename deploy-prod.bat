@echo off
cd /d "%~dp0"
call build-prod.bat
exit /b %ERRORLEVEL%
