@echo off

echo Starting Stable Diffusion WebUI with API and CORS enabled...
echo This will allow local web applications to access the SD API

set PYTHON=
set GIT=
set VENV_DIR=
set COMMANDLINE_ARGS=--styles-file=".\styles*.csv" --api --listen --port 7860 --cors-allow-origins=*

echo Command line args: %COMMANDLINE_ARGS%
echo Stable Diffusion path: C:\AI\stable-diffusion-webui-1.10.1
echo.
echo Starting WebUI...

cd /d "C:\AI\stable-diffusion-webui-1.10.1"
call webui.bat
