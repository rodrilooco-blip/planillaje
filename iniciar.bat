@echo off
title Sistema de Planillaje
cd /d "%~dp0"
color 1F
cls

echo ============================================
echo      SISTEMA DE PLANILLAJE MEDICO
echo ============================================
echo.

:: Verificar Node.js
node --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no instalado.
    pause
    exit /b
)

:: Verificar .env
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env" >nul
)

:: Verificar dependencias
if not exist "backend\node_modules" (
    echo Instalando dependencias...
    cd /d "%~dp0backend"
    call npm install --no-fund --no-audit
    cd /d "%~dp0"
)

:: Iniciar servidor (ventana minimizada)
cd /d "%~dp0backend"
start /min "" node server.js

:: Esperar y abrir navegador
echo Esperando 15 segundos mientras cargan los catalogos...
echo.
ping -n 15 127.0.0.1 >nul

echo Abriendo navegador...
start "" http://localhost:3000

cls
echo ============================================
echo      SISTEMA DE PLANILLAJE MEDICO
echo ============================================
echo.
echo  Servidor iniciado en: http://localhost:3000
echo.
echo  CIERRE ESTA VENTANA para detener el servidor
echo ============================================
echo.
pause >nul
taskkill /f /im node.exe >nul 2>nul
