@echo off
set "PATH=%~dp0.tools\node-v24.21.0-win-x64;%~dp0.tools\runner\node_modules\.bin;%~dp0.tools\pgsql\bin;%PATH%"
"%~dp0.tools\node-v24.21.0-win-x64\node.exe" "%~dp0.tools\runner\node_modules\pnpm\bin\pnpm.cjs" %*
