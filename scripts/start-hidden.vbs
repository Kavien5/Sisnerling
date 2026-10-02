' Launcher tersembunyi untuk SISNERLING (tanpa jendela cmd)
Set sh = CreateObject("Wscript.Shell")
sh.CurrentDirectory = "C:\laragon\www\Project-Sisnerling2"
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\laragon\www\Project-Sisnerling2\scripts\dev.js""", 0, False
