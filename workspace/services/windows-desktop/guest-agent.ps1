$ErrorActionPreference = 'Stop'
$root = 'C:\Course'
$work = 'C:\CourseWork'
$state = Join-Path $env:LOCALAPPDATA 'AISecEdu'
foreach ($directory in @($root, $work, $state)) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$jobs = @{}
$services = @{}
$port = New-Object System.IO.Ports.SerialPort COM2,115200,None,8,one
$port.Encoding = $utf8
$port.ReadTimeout = 10000
$port.WriteTimeout = 30000

function Course-Path($relative) {
    if ($relative -notmatch '^[A-Za-z0-9_][A-Za-z0-9_./-]{0,180}$' -or $relative.Split('/') -contains '..') { throw 'Invalid course file path' }
    foreach ($part in $relative.Split('/')) {
        if ($part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)' -or $part.EndsWith('.')) { throw 'Reserved Windows file name' }
    }
    $path = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $path.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'File is outside the course directory' }
    return $path
}

function Start-Command($command) {
    $id = [Guid]::NewGuid().ToString('N')
    $script = Join-Path $state ($id + '.ps1')
    $header = "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding(`$false)`r`nSet-Location '$work'`r`n"
    [IO.File]::WriteAllText($script, $header + $command, (New-Object System.Text.UTF8Encoding($true)))
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = 'powershell.exe'
    $info.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $script + '"'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = $utf8
    $info.StandardErrorEncoding = $utf8
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    $null = $process.Start()
    $jobs[$id] = @{ process = $process; output = $process.StandardOutput.ReadToEndAsync(); errors = $process.StandardError.ReadToEndAsync(); script = $script; started = [DateTime]::UtcNow }
    return $id
}

function Process-Request($request) {
    switch ($request.operation) {
        'hello' {
            return @{ ok = $true; version = 1; os = [Environment]::OSVersion.VersionString; user = [Environment]::UserName; directory = $root }
        }
        'file' {
            $path = Course-Path $request.path
            $bytes = [Convert]::FromBase64String($request.content)
            if ($bytes.Length -gt 262144) { throw 'Course file exceeds transfer limit' }
            New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($path)) | Out-Null
            if ($request.chunk) {
                $offset = [int]$request.offset
                if ($offset -lt 0 -or $offset + $bytes.Length -gt 1048576) { throw 'Course file exceeds size limit' }
                $file = [IO.File]::Open($path, 'OpenOrCreate', 'Write', 'None')
                try {
                    if ($offset -eq 0) { $file.SetLength(0) }
                    if ($file.Length -ne $offset) { throw 'Unexpected course transfer offset' }
                    $file.Position = $offset
                    $file.Write($bytes, 0, $bytes.Length)
                } finally { $file.Close() }
            } else { [IO.File]::WriteAllBytes($path, $bytes) }
            return @{ ok = $true; sha256 = (Get-FileHash $path -Algorithm SHA256).Hash.ToLower() }
        }
        'start-services' {
            foreach ($service in $request.services) {
                if ($services.ContainsKey($service.name)) { continue }
                $entry = Course-Path $service.entrypoint
                if (-not (Test-Path -LiteralPath $entry)) { throw 'Service entry point is missing' }
                $argumentsJson = ConvertTo-Json -InputObject @($service.arguments) -Compress
                $arguments64 = [Convert]::ToBase64String($utf8.GetBytes($argumentsJson))
                $arguments = "`$courseArgs = @([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$arguments64')) | ConvertFrom-Json)`r`n"
                $command = "Set-Location '$root'`r`n" + $arguments
                if ($service.interpreter -eq 'powershell') { $command += "& '$entry' @courseArgs" }
                elseif ($service.interpreter -eq 'cmd') { $command += "& cmd.exe /d /c '$entry' @courseArgs" }
                else { throw 'Unsupported Windows interpreter' }
                $id = Start-Command $command
                $process = $jobs[$id].process
                $services[$service.name] = @{ pid = $process.Id; startTime = $process.StartTime.ToUniversalTime().Ticks.ToString(); job = $id; entrypoint = $service.entrypoint }
            }
            Copy-Item -LiteralPath 'C:\ProgramData\AISecEdu\check.cmd' -Destination (Join-Path $root 'check.cmd') -Force
            foreach ($service in $request.services) {
                if (-not $service.port) { continue }
                $deadline = [DateTime]::UtcNow.AddSeconds(20)
                while ($true) {
                    $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
                    if ($listeners | Where-Object { $_.Port -eq [int]$service.port }) { break }
                    if ([DateTime]::UtcNow -gt $deadline) { throw ('Windows service did not become ready: ' + $service.name) }
                    Start-Sleep -Milliseconds 200
                }
            }
            Start-Process 'C:\VSCode\Code.exe' -ArgumentList @('--reuse-window', $root)
            return @{ ok = $true; services = $services }
        }
        'exec' {
            if ($request.command.Length -gt 16000) { throw 'Command exceeds limit' }
            return @{ ok = $true; job = (Start-Command $request.command) }
        }
        'job' {
            $job = $jobs[$request.job]
            if (-not $job) { throw 'Unknown command job' }
            $process = $job.process
            $process.Refresh()
            if (-not $process.HasExited -and ([DateTime]::UtcNow - $job.started).TotalSeconds -gt 90) {
                & taskkill.exe /PID $process.Id /T /F | Out-Null
                return @{ ok = $false; error = 'Windows command timed out' }
            }
            if (-not $process.HasExited) { return @{ ok = $true; done = $false } }
            if (-not $job.output.IsCompleted -or -not $job.errors.IsCompleted) { return @{ ok = $true; done = $false } }
            $output = $job.output.Result
            $errors = $job.errors.Result
            if ($output.Length -gt 32768) { $output = $output.Substring(0, 32768) }
            if ($errors.Length -gt 8192) { $errors = $errors.Substring(0, 8192) }
            return @{ ok = $true; done = $true; exitCode = $process.ExitCode; stdout = $output; stderr = $errors }
        }
        'http' {
            $record = $services[$request.service]
            if (-not $record -or $record.pid -ne $request.pid -or $record.startTime -ne $request.startTime) { throw 'Original service identity does not match' }
            $process = Get-Process -Id $record.pid -ErrorAction Stop
            if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne $record.startTime) { throw 'Service process was replaced' }
            foreach ($file in $request.integrity.PSObject.Properties) {
                if ((Get-FileHash (Course-Path $file.Name) -Algorithm SHA256).Hash.ToLower() -ne $file.Value) { throw 'Course file integrity check failed' }
            }
            $url = 'http://127.0.0.1:' + [int]$request.port + $request.binding.path
            $http = [Net.HttpWebRequest]::Create($url)
            $http.Method = 'GET'
            $http.AllowAutoRedirect = $false
            $http.Timeout = 3000
            $http.ReadWriteTimeout = 3000
            $http.Proxy = $null
            foreach ($header in $request.binding.headers.PSObject.Properties) { $http.Headers[$header.Name] = [string]$header.Value }
            try { $response = $http.GetResponse() }
            catch [Net.WebException] { if ($_.Exception.Response) { $response = $_.Exception.Response } else { throw } }
            try {
                $stream = $response.GetResponseStream()
                $memory = New-Object IO.MemoryStream
                $buffer = New-Object byte[] 4096
                while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $memory.Write($buffer, 0, $count)
                    if ($memory.Length -gt 65536) { throw 'Service response exceeds limit' }
                }
                return @{ ok = $true; status = [int]$response.StatusCode; body = [Convert]::ToBase64String($memory.ToArray()) }
            } finally { $response.Close() }
        }
        default { throw 'Unknown runtime operation' }
    }
}

while ($true) {
    try {
        if (-not $port.IsOpen) { $port.Open() }
        $line = $port.ReadLine()
        if ($line.Length -gt 400000) { continue }
        $request = $line | ConvertFrom-Json
        try { $result = Process-Request $request }
        catch { $result = @{ ok = $false; error = $_.Exception.Message } }
        $result.id = $request.id
        $port.WriteLine(($result | ConvertTo-Json -Compress -Depth 10))
    } catch [TimeoutException] {
        continue
    } catch {
        if ($port.IsOpen) { $port.Close() }
        $_.Exception.Message | Add-Content (Join-Path $state 'agent-errors.log')
        Start-Sleep -Seconds 3
    }
}
