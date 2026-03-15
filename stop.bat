@echo off
echo Stoppe SolvAI Prozesse...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    echo Stoppe Backend (PID %%a) auf Port 3001
    taskkill /PID %%a /F >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo Stoppe Frontend (PID %%a) auf Port 5173
    taskkill /PID %%a /F >nul 2>&1
)

echo Alle SolvAI Prozesse gestoppt.
pause
