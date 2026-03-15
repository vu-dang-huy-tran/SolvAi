@echo off
cd /d "%~dp0"
start "SolvAI Backend" node backend/server.js
start "SolvAI Frontend" cmd /c "cd frontend && node node_modules/vite/bin/vite.js"
echo Server gestartet: Backend auf Port 3001, Frontend auf Port 5173
