@echo off
rem Console to UTF-8: this file is UTF-8, and a GBK console (the default on zh-CN Windows)
rem garbles the Chinese text below. / 切到 UTF-8，否则中文提示在 GBK 控制台上是乱码。
chcp 65001 >nul
rem Open a .md file in the reader / 用阅读器打开 .md 文件
rem Usage / 用法:
rem   1) Drag a .md file onto this script / 把 .md 文件拖到本脚本上
rem   2) Or: Open-MD-File.bat "C:\path\file.md"
rem
rem This file must stay CRLF: cmd.exe misreads LF-only batch files and fails on every
rem line (see .gitattributes). / 本文件必须保持 CRLF，否则 cmd.exe 会逐行报错。
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

powershell -NoProfile -Sta -ExecutionPolicy Bypass -File "%~dp0open-md.ps1" -MdPath "%~f1"
if errorlevel 1 (
  echo.
  echo Could not build the reading page. The message above says why. / 生成阅读页面失败，原因见上一行。
  pause
  exit /b 1
)
exit /b 0
