@echo off
rem Launch Minimal Markdown Reader / 启动极简 Markdown 阅读器
rem Prefer Edge app mode so it feels like a tiny desktop tool.
rem 优先使用 Edge 应用模式，体验更像独立小工具。
setlocal
set "APP=%~dp0md-reader.html"

where msedge >nul 2>&1
if %errorlevel%==0 (
  start "" msedge --app="%APP%"
  exit /b 0
)

where chrome >nul 2>&1
if %errorlevel%==0 (
  start "" chrome --app="%APP%"
  exit /b 0
)

start "" "%APP%"
exit /b 0
