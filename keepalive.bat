@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/health' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -ne 200) { throw } } catch { Start-Process -WindowStyle Hidden -FilePath 'wscript.exe' -ArgumentList '\"%~dp0run_server_background.vbs\"' }"

