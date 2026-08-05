@echo off
setlocal
rem ============================================================================
rem  tools\audit.cmd - THE way to start a #221 audit slice.
rem
rem  WHY THIS EXISTS (#382). The independence mechanism (.claude/settings.audit.json)
rem  was a flag written in an issue body, and #297 records two consecutive slices
rem  launched bare. A flag you have to remember is not a mechanism.
rem
rem      tools\audit.cmd 344            launch slice 9 (#344)
rem      tools\audit.cmd 344 --print    check and print the launch line, launch nothing
rem
rem  Preflight exits 2 and names the cause if the session would not actually be
rem  independent; this script then refuses to launch. Do NOT work around it by
rem  typing the claude command by hand - that is precisely the failure being fixed.
rem
rem  KEEP THIS FILE PURE ASCII AND CRLF. cmd.exe reads batch files in the OEM code
rem  page and mis-parses LF-only files (it re-reads and loops); see the same note
rem  in tools/make_portable.cmd.
rem ============================================================================

set "ROOT=%~dp0.."
if "%~1"=="" goto usage
set "SLICE=%~1"
echo %SLICE%| findstr /r /c:"^[0-9][0-9]*$" >nul
if errorlevel 1 goto usage
set "PRINTONLY="
if /i "%~2"=="--print" set "PRINTONLY=1"

pushd "%ROOT%"
if errorlevel 1 exit /b 2

call node tools\audit_preflight.js %SLICE%
if errorlevel 1 goto refused

if defined PRINTONLY (
  echo   [--print] not launching.
  popd
  exit /b 0
)

echo Launching audit session for slice #%SLICE% ...
echo.
call claude --settings .claude\settings.audit.json "You are running audit slice #%SLICE% of the independent subsystem audit programme (GitHub #221). Read Blueprint/AUDIT_CHARTER.md first - it replaces CLAUDE.md for this session. Then read the slice's scope and rubric with: gh issue view %SLICE% --repo TH462/Reactor-Dynamics. Before you read any source file, post the independence self-check as a comment on that issue: state whether CLAUDE.md was auto-loaded into your context without you reading it, and whether you can see an auto-memory index. If either is present, stop and say so - the slice is not independent and the exclusion needs fixing first."
set "RC=%errorlevel%"
popd
exit /b %RC%

:refused
popd
exit /b 2

:usage
echo usage: tools\audit.cmd ^<slice-issue-number^> [--print]
echo.
echo   #221 slice issues: 295 296 297 298 299 300 301 342 344
echo   Running order:     1 . 2 . 3 . 9 . 8 . 4 . 5 . 6 . 7
exit /b 2
