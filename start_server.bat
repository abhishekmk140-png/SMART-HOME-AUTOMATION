@echo off
title Smart Home Automation Server (144Hz / 90FPS Engine)
cd /d "%~dp0backend"
echo ========================================================
echo   SMART HOME AUTOMATION - LOCAL CONTROLLER
echo ========================================================
echo.
echo Starting local backend on port 8000...
echo.
echo Open in your browser:
echo   - On this PC:    http://localhost:8000
echo   - On your Phone: http://192.168.1.12:8000
echo.
echo Connected to Wi-Fi. Press Ctrl+C to stop.
echo ========================================================
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
