@echo off
cd /d "%~dp0"
call build-preprod.bat
exit /b %ERRORLEVEL%
