@echo off
title Sistema de Planillaje
cd /d "%~dp0"
color 17

echo ============================================
echo      SISTEMA DE PLANILLAJE MEDICO
echo ============================================
echo.
echo Iniciando servidor...
echo.

:: Verificar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado.
    echo Descargar: https://nodejs.org/ (version 16 LTS)
    pause
    exit /b
)

:: Verificar dependencias
if not exist "backend\node_modules" (
    echo Instalando dependencias (primera vez)...
    cd /d "%~dp0backend"
    npm install --no-fund --no-audit
    if %errorlevel% neq 0 (
        echo [ERROR] Fallo al instalar dependencias.
        pause
        exit /b
    )
    cd /d "%~dp0"
)

:: Iniciar servidor
echo Abriendo navegador...
start "" http://localhost:3000

echo Servidor corriendo en: http://localhost:3000
echo.
echo Para DETENER el servidor: cierre esta ventana o presione Ctrl+C
echo.
cd /d "%~dp0backend"
node server.js

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] El servidor se cerro inesperadamente.
    pause
)
