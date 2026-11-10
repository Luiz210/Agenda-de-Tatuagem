@echo off
setlocal
title Gerar o instalador da Agenda de Tatuagem
set "RAIZ=%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo Abra este arquivo com o botao direito: Executar como administrador.
  goto fim
)

set "JLINK=jlink"
if defined JAVA_HOME set "JLINK=%JAVA_HOME%\bin\jlink.exe"
"%JLINK%" --version >nul 2>&1
if not errorlevel 1 goto java_ok
echo Nao encontrei um JDK neste computador. Ele so e necessario para gerar o instalador.
echo Instale um JDK 17 ou mais novo e rode este arquivo de novo.
goto fim
:java_ok

if "%~1"=="publicar" if not defined GH_TOKEN (
  echo A chave de publicacao do GitHub nao foi encontrada: configure GH_TOKEN e abra este arquivo de novo.
  goto fim
)

echo Antes de continuar, pare o Spring e o npm start, e feche a Agenda de Tatuagem pelo icone da bandeja: Sair.
pause

echo.
echo [1/4] Gerando as telas...
pushd "%RAIZ%frontend"
call npm install
if errorlevel 1 goto erro
call npx ng build --configuration production,desktop
if errorlevel 1 goto erro
popd

echo.
echo [2/4] Gerando o back end...
pushd "%RAIZ%backend"
call mvnw.cmd -DskipTests clean package
if errorlevel 1 goto erro
popd

echo.
echo [3/4] Juntando os arquivos...
if exist "%RAIZ%desktop\ui" rmdir /s /q "%RAIZ%desktop\ui"
robocopy "%RAIZ%frontend\dist\agenda-tatuagem\browser" "%RAIZ%desktop\ui" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto erro_simples
if not exist "%RAIZ%desktop\backend" mkdir "%RAIZ%desktop\backend"
copy /y "%RAIZ%backend\target\agenda-tatuagem-0.0.1-SNAPSHOT.jar" "%RAIZ%desktop\backend\agenda.jar" >nul
if errorlevel 1 goto erro_simples
if exist "%RAIZ%desktop\backend\jre" rmdir /s /q "%RAIZ%desktop\backend\jre"
"%JLINK%" --add-modules java.se,jdk.unsupported,jdk.crypto.ec,jdk.zipfs,jdk.management,jdk.naming.dns --no-header-files --no-man-pages --strip-debug --compress=2 --output "%RAIZ%desktop\backend\jre"
if errorlevel 1 goto erro_simples

echo.
echo [4/4] Gerando o instalador...
pushd "%RAIZ%desktop"
call npm install
if errorlevel 1 goto erro
if "%~1"=="publicar" goto publicar
call npx electron-builder --win
if errorlevel 1 goto erro
goto gerado
:publicar
call npm version patch --no-git-tag-version
if errorlevel 1 goto erro
call node criar-versao.js
if errorlevel 1 goto erro
call npx electron-builder --win --publish always
if errorlevel 1 goto erro
:gerado
popd

echo.
if "%~1"=="publicar" echo Versao publicada: os aplicativos instalados vao atualizar sozinhos.
echo Pronto. O instalador esta em %RAIZ%desktop\dist
start "" "%RAIZ%desktop\dist"
goto fim

:erro
popd
:erro_simples
echo.
echo Parou com erro. Me mande o que apareceu acima.

:fim
echo.
pause
