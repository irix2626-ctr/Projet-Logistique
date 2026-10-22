$LogFile = Join-Path $PSScriptRoot 'tauri-dev.log'
Set-Location $PSScriptRoot
"=== Demarrage $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $LogFile -Encoding utf8
npm run tauri dev 2>&1 | Tee-Object -FilePath $LogFile -Append
