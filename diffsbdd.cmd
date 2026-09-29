@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0diffsbdd.ps1" %*
exit /b %errorlevel%
