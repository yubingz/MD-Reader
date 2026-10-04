@echo off
rem Console to UTF-8: this file is UTF-8, and a GBK console (the default on zh-CN Windows)
rem garbles the Chinese text below. / 切到 UTF-8，否则中文提示在 GBK 控制台上是乱码。
chcp 65001 >nul
rem Launch the reader / 启动阅读器
rem
rem Double-click          -> pick a file in the dialog, it opens in the reader
rem                          (cancel the dialog to get an empty reader)
rem Drag a .md onto it    -> that file opens in the reader
rem
rem This file must stay CRLF: cmd.exe misreads LF-only batch files and fails on every
rem line (see .gitattributes). / 本文件必须保持 CRLF，否则 cmd.exe 会逐行报错。
setlocal

if "%~1"=="" (
  powershell -NoProfile -Sta -ExecutionPolicy Bypass -File "%~dp0open-md.ps1" -Pick
) else (
  powershell -NoProfile -Sta -ExecutionPolicy Bypass -File "%~dp0open-md.ps1" -MdPath "%~f1"
)

if errorlevel 1 (
  echo.
  echo Could not open the reader. The message above says why. / 打开失败，原因见上一行。
  pause
  exit /b 1
)
exit /b 0
