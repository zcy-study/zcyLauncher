$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$out = [Console]::Out
while ($true) {
  $rows = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name, ExecutablePath | ForEach-Object {
    [pscustomobject]@{
      i = [int]$_.ProcessId
      p = [int]$_.ParentProcessId
      n = $_.Name
      e = $_.ExecutablePath
    }
  }
  $json = ConvertTo-Json -InputObject @($rows) -Compress -Depth 2
  if (-not $json) { $json = '[]' }
  $out.WriteLine('SNAP ' + $json)
  Start-Sleep -Milliseconds 2500
}
