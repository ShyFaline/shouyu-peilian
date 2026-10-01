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
start "" cmd /c "timeout /t 1 >/dev/null && start http://localhost:%PORT%/"

rem serve.py disables browser caching; plain http.server lets browsers
rem mix old/new JS module files after updates and the page breaks.
where python >/dev/null 2>/dev/null && (
  python serve.py %PORT%
  goto :eof
)
where py >/dev/null 2>/dev/null && (
  py serve.py %PORT%
  goto :eof
)
where npx >/dev/null 2>/dev/null && (
  npx --yes http-server -p %PORT% -c-1
  goto :eof
)

echo [ERROR] python / py / npx not found. Install Python or Node.js first.
pause
