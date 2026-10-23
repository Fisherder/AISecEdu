@echo off
setlocal
if not exist C:\AISecEduEval mkdir C:\AISecEduEval
xcopy /E /I /Y "%~dp0OllyDbg" C:\AISecEduEval\OllyDbg >nul
copy /Y "%~dp0compatibility-check.exe" C:\AISecEduEval\compatibility-check.exe >nul
ver > C:\AISecEduEval\report.txt
wmic os get Caption,Version,OSArchitecture >> C:\AISecEduEval\report.txt
wmic path SoftwareLicensingProduct where "Name like 'Windows%%'" get Name,LicenseStatus,GracePeriodRemaining >> C:\AISecEduEval\report.txt
C:\AISecEduEval\compatibility-check.exe >> C:\AISecEduEval\report.txt
mode COM1: BAUD=115200 PARITY=N DATA=8 STOP=1 >nul
type C:\AISecEduEval\report.txt > COM1
type C:\AISecEduEval\report.txt
start "" C:\AISecEduEval\OllyDbg\ollydbg.exe C:\AISecEduEval\compatibility-check.exe
pause
