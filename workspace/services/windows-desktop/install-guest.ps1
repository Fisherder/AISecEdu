$ErrorActionPreference = 'Stop'
$root = 'C:\ProgramData\AISecEdu'
New-Item -ItemType Directory -Force -Path $root | Out-Null
foreach ($process in Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'") {
    if ($process.ProcessId -ne $PID -and ($process.CommandLine -like '*-File C:\Lab\Environment\environment-check.ps1*' -or $process.CommandLine -like '*-File C:\ProgramData\AISecEdu\agent.ps1*')) {
        Stop-Process -Id $process.ProcessId -Force
    }
}
Copy-Item (Join-Path $PSScriptRoot 'guest-agent.ps1') (Join-Path $root 'agent.ps1') -Force
Copy-Item (Join-Path $PSScriptRoot 'guest-check.ps1') (Join-Path $root 'check.ps1') -Force
Copy-Item (Join-Path $PSScriptRoot 'guest-check.cmd') (Join-Path $root 'check.cmd') -Force
$startup = [Environment]::GetFolderPath('Startup')
$legacyStartup = Join-Path $startup 'AISecEdu environment check.lnk'
if (Test-Path -LiteralPath $legacyStartup) { Move-Item -LiteralPath $legacyStartup -Destination (Join-Path $root 'environment-check-startup.lnk') -Force }
$command = 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\ProgramData\AISecEdu\agent.ps1", 0, False'
[IO.File]::WriteAllText((Join-Path $startup 'AISecEduRuntime.vbs'), $command, [Text.Encoding]::ASCII)
$shell = New-Object -ComObject WScript.Shell
$codeStartup = $shell.CreateShortcut((Join-Path $startup 'AISecEdu VS Code.lnk'))
$codeStartup.TargetPath = 'C:\VSCode\Code.exe'
$codeStartup.Arguments = '--reuse-window C:\Course'
$codeStartup.Save()
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Course files.lnk'))
$shortcut.TargetPath = 'explorer.exe'
$shortcut.Arguments = 'C:\Course'
$shortcut.Save()
New-Item -ItemType Directory -Force -Path 'C:\Course', 'C:\CourseWork' | Out-Null
Start-Process powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', (Join-Path $root 'agent.ps1'))
Write-Output 'AISecEdu Windows runtime agent installed.'
