Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath & "\backend"
WshShell.Run "python -m uvicorn main:app --host 0.0.0.0 --port 8000", 0, False

