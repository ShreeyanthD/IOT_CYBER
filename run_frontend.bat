@echo off
cd /d "%~dp0frontend"
echo Starting IoT Sentinel Frontend...
call npm.cmd run dev
pause