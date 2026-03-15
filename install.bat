@echo off
echo === SolvAI Dependencies installieren ===
echo.

echo [1/2] Backend...
cd /d "%~dp0backend"
call npm install
echo.

echo [2/2] Frontend...
cd /d "%~dp0frontend"
call npm install
echo.

echo === Fertig! ===
pause
