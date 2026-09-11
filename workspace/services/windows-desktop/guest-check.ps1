$ErrorActionPreference = 'Stop'
$port = New-Object System.IO.Ports.SerialPort COM1,115200,None,8,one
$port.Encoding = New-Object Text.UTF8Encoding($false)
$port.ReadTimeout = 45000
$port.WriteTimeout = 10000
try {
    $port.Open()
    $port.WriteLine((@{ operation = 'check'; arguments = @($args) } | ConvertTo-Json -Compress))
    $result = $port.ReadLine() | ConvertFrom-Json
    Write-Output $result.message
    if (-not $result.ok) { exit 1 }
} finally { if ($port.IsOpen) { $port.Close() } }
