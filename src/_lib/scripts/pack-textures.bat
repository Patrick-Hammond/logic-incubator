@echo off
setlocal

REM Purpose:
REM   Pack sprites into a PixiJS spritesheet and normalize frame keys in the JSON output.
REM
REM Usage:
REM   pack-textures.bat <packer_exe_path> <source_folder> <dest_folder>
REM
REM Arguments:
REM   1) packer_exe_path  Path to SpriteSheetPacker executable (with or without .exe)
REM   2) source_folder    Folder containing source sprite frames
REM   3) dest_folder      Folder where output .json/.png are written

if "%~3"=="" (
	echo Usage: %~nx0 ^<packer_exe_path^> ^<source_folder^> ^<dest_folder^>
	exit /b 1
)

set "PACKER_EXE=%~1"
set "SOURCE_DIR=%~2"
set "DEST_DIR=%~3"

if not exist "%PACKER_EXE%" if exist "%PACKER_EXE%.exe" (
	set "PACKER_EXE=%PACKER_EXE%.exe"
)

if not exist "%PACKER_EXE%" (
	echo Error: Packer executable not found: "%PACKER_EXE%"
	exit /b 1
)

if not exist "%SOURCE_DIR%" (
	echo Error: Source folder not found: "%SOURCE_DIR%"
	exit /b 1
)

if not exist "%DEST_DIR%" (
	echo Error: Destination folder not found: "%DEST_DIR%"
	exit /b 1
)

"%PACKER_EXE%" -f pixijs "%SOURCE_DIR%" "%DEST_DIR%"
set "PACKER_RAW_EXIT=%errorlevel%"
set "PACKER_EXIT=%PACKER_RAW_EXIT%"

for %%I in ("%SOURCE_DIR%") do set "PACK_NAME=%%~nI"
set "OUT_JSON=%DEST_DIR%\%PACK_NAME%.json"
set "OUT_PNG=%DEST_DIR%\%PACK_NAME%.png"
set "STRIP_EXIT=0"

if not exist "%OUT_JSON%" goto after_strip_prefix
node -e "const fs=require('fs');const p=process.argv[1];const json=JSON.parse(fs.readFileSync(p,'utf8'));if(json&&json.frames&&typeof json.frames==='object'){const out={};for(const [k,v] of Object.entries(json.frames)){const name=k.split(/[\\/]/).pop();out[name]=v;}json.frames=out;}fs.writeFileSync(p, JSON.stringify(json,null,'\t')+'\n','utf8');" "%OUT_JSON%"
set "STRIP_EXIT=%errorlevel%"
if not "%STRIP_EXIT%"=="0" (
	echo Error: Failed to strip "frames/" prefix from "%OUT_JSON%".
	set "PACKER_EXIT=1"
)
:after_strip_prefix

if "%PACKER_RAW_EXIT%"=="1" (
	if exist "%OUT_JSON%" if exist "%OUT_PNG%" (
		if "%STRIP_EXIT%"=="0" (
			echo SpriteSheetPacker returned 1, but output files were generated. Treating as success.
			exit /b 0
		)
	)
)

exit /b %PACKER_EXIT%