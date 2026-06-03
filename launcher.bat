@echo off
REM Anvika launcher. Double-click this file to open the interactive menu.
REM It runs tooling\launcher.ps1 (the real logic) with the execution policy bypassed for
REM this one process only, so no permanent policy change is made.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tooling\launcher.ps1"
