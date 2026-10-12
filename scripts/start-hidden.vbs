' Launcher tersembunyi untuk SISNERLING (tanpa jendela cmd)
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set sh = CreateObject("Wscript.Shell")
sh.CurrentDirectory = root
sh.Run "cmd.exe /c cd /d """ & root & """ && node scripts\dev.js", 0, False
