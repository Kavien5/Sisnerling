@echo off
cd /d "%~dp0.."
node scripts\dev.js
if errorlevel 1 pause
