@echo off
REM Start the Node.js server
start "" cmd /c "node server.js"

REM Give the server a moment to start
timeout /t 3 /nobreak >nul

REM Open Chrome to the app URL (falls back to default handler if chrome is on PATH)
start "" chrome "http://localhost:3100"

