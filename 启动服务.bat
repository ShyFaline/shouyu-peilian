@echo off
title Sign Language Practice - Local Server
cd /d "%~dp0practice"

set PORT=8000

echo ============================================
echo   Sign Language Practice - Local Server
echo   URL: http://localhost:%PORT%/
echo   Close this window to stop the server.
echo ============================================
echo.

rem Open the browser 1 second later, after the server is up.
start "" cmd /c "timeout /t 1 >nul && start http://localhost:%PORT%/"

where python >nul 2>nul && (
  python -m http.server %PORT%
  goto :eof
)
where py >nul 2>nul && (
  py -m http.server %PORT%
  goto :eof
)
where npx >nul 2>nul && (
  npx --yes http-server -p %PORT% -c-1
  goto :eof
)

echo [ERROR] python / py / npx not found. Install Python or Node.js first.
pause
