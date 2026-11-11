@echo off
setlocal
cd /d "%~dp0"
title TEMBO - setup

echo ==============================================
echo   TEMBO : start local dev (Windows)
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 goto no_node
where docker >nul 2>nul
if errorlevel 1 goto no_docker
docker info >nul 2>nul
if errorlevel 1 goto docker_off

where pnpm >nul 2>nul
if not errorlevel 1 goto have_pnpm
echo [1/7] Installing pnpm...
call npm install -g pnpm@10.28.0
if errorlevel 1 goto fail
:have_pnpm

if exist .env goto have_env
echo [2/7] Creating .env with random secrets...
copy /y .env.example .env >nul
node -e "const fs=require('fs'),c=require('crypto');let s=fs.readFileSync('.env','utf8');s=s.replace('change-me-to-a-long-random-string',c.randomBytes(32).toString('hex')).replace('change-me-to-another-long-random-string',c.randomBytes(32).toString('hex'));fs.writeFileSync('.env',s)"
if errorlevel 1 goto fail
:have_env

echo [3/7] Starting PostgreSQL (docker compose)...
docker compose up -d
if errorlevel 1 goto fail
set /a tries=0
:wait_db
docker compose exec -T db pg_isready -U tembo >nul 2>nul
if not errorlevel 1 goto db_ready
set /a tries+=1
if %tries% geq 30 goto fail
timeout /t 2 /nobreak >nul
goto wait_db
:db_ready

echo [4/7] Installing packages (first time takes a few minutes)...
call pnpm install
if errorlevel 1 goto fail

echo [5/7] Building shared packages + Prisma client...
call pnpm build:packages
if errorlevel 1 goto fail

echo [6/7] Migrating + seeding database...
call pnpm db:deploy
if errorlevel 1 goto fail
call pnpm db:seed
if errorlevel 1 goto fail

echo [7/7] Starting API (port 4000) and Web (port 3000)...
start "TEMBO API  - OTP codes appear here" cmd /k pnpm dev:api
start "TEMBO Web" cmd /k pnpm dev:web
echo Waiting for the web server...
timeout /t 20 /nobreak >nul
start "" http://localhost:3000

echo.
echo Done! Open http://localhost:3000
echo The OTP code is printed in the "TEMBO API" window (line [DEV MAIL]).
echo To stop: close the API and Web windows, then run: docker compose stop
echo.
pause
exit /b 0

:no_node
echo [!] Node.js not found. Install Node.js 22 LTS from https://nodejs.org then run this file again.
goto end
:no_docker
echo [!] Docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ then run this file again.
goto end
:docker_off
echo [!] Docker Desktop is not running. Open Docker Desktop, wait until it says "Engine running", then run this file again.
goto end
:fail
echo.
echo [!] Something failed above. Take a screenshot of this window and send it to Claude.
:end
echo.
pause
exit /b 1
