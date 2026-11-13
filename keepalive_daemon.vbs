Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
strPath = "C:\Users\Asus\OneDrive\Desktop\smart-home"

Do
    bHealthy = False
    On Error Resume Next
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 2000, 2000, 2000, 2000
    http.open "GET", "http://127.0.0.1:8000/api/health", False
    http.send
    If Err.Number = 0 And http.status = 200 Then
        bHealthy = True
    End If
    On Error GoTo 0

    If Not bHealthy Then
        WshShell.CurrentDirectory = strPath & "\backend"
        WshShell.Run "python -m uvicorn main:app --host 0.0.0.0 --port 8000", 0, False
    End If

    WScript.Sleep 15000
Loop

