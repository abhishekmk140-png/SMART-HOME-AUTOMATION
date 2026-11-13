@echo off
title Smart Home - Public Cloud Link
cd /d "%~dp0"
echo ========================================================
echo    SMART HOME AUTOMATION - SECURE CLOUD LINK
echo ========================================================
echo.
echo Starting secure HTTPS tunnel to connect Vercel to your
echo local ESP32 hardware...
echo.
echo ========================================================
echo Look below for your public URL (https://*.trycloudflare.com)
echo Copy that URL and paste it into Settings on your Vercel app!
echo ========================================================
echo.
.\cloudflared.exe tunnel --url http://localhost:8000
pause
