@echo off
cd /d C:\laragon\www\Project-Sisnerling2
start "" /min cmd /c "cd /d C:\laragon\www\Project-Sisnerling2\server && node server.js > C:\laragon\www\Project-Sisnerling2\logs\server.log 2>&1"
start "" /min cmd /c "cd /d C:\laragon\www\Project-Sisnerling2\client && npm run dev > C:\laragon\www\Project-Sisnerling2\logs\client.log 2>&1"
