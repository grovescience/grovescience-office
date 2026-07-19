@echo off
setlocal
cd /d "%~dp0"
set "PY=C:\Users\sesil\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
set "SERVER=%CD%\office-server.py"
set "URL=http://127.0.0.1:5178/index.html"
set "APP_FILE=%CD%\index.html"

if not exist "%PY%" (
  echo Python runtime was not found.
  echo Please ask Codex to reopen the management site.
  pause
  exit /b 1
)

if not exist "%APP_FILE%" (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$src = Get-ChildItem -LiteralPath (Get-Location) -Filter '*.html' | Where-Object { $_.Name -ne 'index.html' } | Select-Object -First 1; if ($src) { Copy-Item -LiteralPath $src.FullName -Destination 'index.html' -Force }"
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 5178 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p -and ($p.ProcessName -in @('python','pythonw','node'))) { Stop-Process -Id $p.Id -Force } }"

timeout /t 1 /nobreak >nul

start "office-server" /min "%PY%" "%SERVER%"
timeout /t 2 /nobreak >nul

:OPEN_CHROME
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$paths = @(); if ($env:ProgramFiles) { $paths += (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe') }; if (${env:ProgramFiles(x86)}) { $paths += (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe') }; if ($env:LocalAppData) { $paths += (Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe') }; $chrome = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1; if ($chrome) { Start-Process -FilePath $chrome -ArgumentList '%URL%'; exit 0 }; Start-Process '%URL%'"
endlocal
