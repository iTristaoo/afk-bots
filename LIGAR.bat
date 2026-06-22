@echo off
title AFK BOTS - deixe esta janela aberta
cd /d "%~dp0"
:loop
node index.js
echo.
echo ===== node caiu. reiniciando em 5s (CTRL+C pra parar) =====
timeout /t 5 >nul
goto loop
