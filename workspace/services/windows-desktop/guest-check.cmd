@echo off
if exist C:\ProgramData\AISecEdu\check-native.exe goto native
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ProgramData\AISecEdu\check.ps1 %*
exit /b %errorlevel%
:native
C:\ProgramData\AISecEdu\check-native.exe %*
exit /b %errorlevel%
