@echo off
chcp 65001 >nul
title Edith
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js олдсонгүй. https://nodejs.org хаягаас LTS хувилбарыг суулгаад дахин нээнэ үү.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

rem npm install бүрэн дууссан үед л node_modules\.package-lock.json үүсдэг.
if not exist node_modules\.package-lock.json (
  echo.
  echo  Шаардлагатай сангуудыг суулгаж байна. Интернэт удаан бол 5-10 минут болж магадгүй...
  echo  VPN асаалттай бол унтраавал хурдан болно.
  echo.
  call npm install --no-audit --no-fund --maxsockets=3 --fetch-retries=6 --fetch-retry-mintimeout=15000 --fetch-retry-maxtimeout=120000
  if errorlevel 1 (
    echo.
    echo  Суулгаж дуусаагүй. Интернэтээ шалгаад энэ файлыг дахин ажиллуулна уу,
    echo  аль хэдийн татсан хэсгийг дахин татахгүй.
    pause
    exit /b 1
  )
)

echo.
echo  Эдитийг асааж байна... Энэ цонхыг хаавал Эдит унтарна.
echo.
call npm run dev
pause
