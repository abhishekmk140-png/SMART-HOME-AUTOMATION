@echo off
title IoT Home Automation Server
cd /d "%~dp0backend"
echo ===================================================
echo Starting IoT Home Automation Server on Port 8000...
echo Access at: http://localhost:8000
echo Network:   http://192.168.1.28:8000
echo ===================================================
python -m uvicorn main:app --host 0.0.0.0 --port 8000
pause

