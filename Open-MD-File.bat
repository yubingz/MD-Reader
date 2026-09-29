@echo off
rem Open a .md file in the reader / 用阅读器打开 .md 文件
rem Usage / 用法:
rem   1) Drag a .md file onto this script / 把 .md 文件拖到本脚本上
rem   2) Or: Open-MD-File.bat "C:\path\file.md"
setlocal
if "%~1"=="" (
  echo Please drop a .md file onto this script, or / 请把 .md 文件拖到本脚本上，或：
  echo   Open-MD-File.bat "C:\path\to\file.md"
  pause
  exit /b 1
)

if not exist "%~1" (
  echo File not found / 文件不存在: %~1
  pause
  exit /b 1
)

set "READER=%~dp0md-reader.html"
if not exist "%READER%" (
  echo Cannot find md-reader.html / 找不到 md-reader.html
  pause
  exit /b 1
)

set "OUT=%TEMP%\md-reader-%RANDOM%.html"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-md.ps1" -MdPath "%~f1" -Reader "%READER%" -Out "%OUT%"
if errorlevel 1 (
  echo Failed to build reading page / 生成阅读页面失败
  pause
  exit /b 1
)

where msedge >nul 2>&1
if %errorlevel%==0 (
  start "" msedge --app="file:///%OUT:\=/%"
  exit /b 0
)
start "" "%OUT%"
exit /b 0
