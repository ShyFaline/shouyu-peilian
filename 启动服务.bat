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

rem Warn early if the port is already taken (often a previous server instance).
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul && (
  echo [WARN] Port %PORT% is already in use. If the page opens, the server is already running.
  echo        Otherwise edit PORT in this file to a free port.
)

rem serve.py disables browser caching; plain http.server lets browsers
rem mix old/new JS module files after updates and the page breaks.
rem Probe with a real run: the WindowsApps "python" stub answers `where`
rem but exits 9009 when executed.
py -3 -c "pass" >nul 2>nul && (
  py -3 serve.py %PORT%
  goto :eof
)
python -c "pass" >nul 2>nul && (
  python serve.py %PORT%
  goto :eof
)
where npx >nul 2>nul && (
  npx --yes http-server -p %PORT% -c-1
  goto :eof
)

echo [ERROR] python / py / npx not found. Install Python or Node.js first.
pause
