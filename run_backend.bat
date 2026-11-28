@echo off
cd /d "%~dp0backend"
echo Starting IoT Sentinel Backend with Conda environment (iot_cyber)...
if exist "C:\Users\Sanjana\anaconda3\envs\iot_cyber\python.exe" (
    "C:\Users\Sanjana\anaconda3\envs\iot_cyber\python.exe" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) else if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
    python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) else (
    python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
)
pause