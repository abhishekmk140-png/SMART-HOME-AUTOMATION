@echo off
set SCRIPT_DIR=%~dp0
set VBS_TARGET=%SCRIPT_DIR%run_server_background.vbs
set STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_VBS=%TEMP%\CreateShortcut.vbs

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%SHORTCUT_VBS%"
echo sLinkFile = "%STARTUP_DIR%\SmartHomeServer.lnk" >> "%SHORTCUT_VBS%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%SHORTCUT_VBS%"
echo oLink.TargetPath = "wscript.exe" >> "%SHORTCUT_VBS%"
echo oLink.Arguments = """%VBS_TARGET%""" >> "%SHORTCUT_VBS%"
echo oLink.Description = "IoT Home Automation Background Server" >> "%SHORTCUT_VBS%"
echo oLink.WorkingDirectory = "%SCRIPT_DIR%backend" >> "%SHORTCUT_VBS%"
echo oLink.Save >> "%SHORTCUT_VBS%"

cscript /nologo "%SHORTCUT_VBS%"
del "%SHORTCUT_VBS%"

echo ==========================================================
echo [SUCCESS] Auto-start shortcut installed!
echo The server will automatically start whenever your laptop boots
echo or you log in, keeping it active 24/7 for the next 3-5 days.
echo ==========================================================
pause

