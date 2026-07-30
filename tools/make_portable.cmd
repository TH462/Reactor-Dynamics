@echo off
rem ============================================================================
rem  make_portable.cmd - DOUBLE-CLICKABLE wrapper for tools/make_portable.js.
rem
rem  WHY THIS EXISTS. Double-clicking a .js file on Windows hands it to Windows
rem  Script Host (cscript/wscript), NOT to Node - and WSH does not understand
rem  "const" or "require", so it dies with:
rem
rem      Syntax error   Code: 800A03EA   JavaScript compilation error
rem
rem  which looks exactly like a broken script and is nothing of the kind. Running
rem  .\tools\make_portable.js in PowerShell does the same thing, for the same
rem  reason (file association, not the shell). This wrapper is the double-click
rem  entry point: it finds Node, runs the bundler from the repo root wherever it
rem  is invoked from, ZIPs the result for email, and holds the window open so the
rem  output is readable instead of flashing past.
rem
rem  From a terminal, "node tools/make_portable.js" remains the direct route.
rem
rem  KEEP THIS FILE PURE ASCII. cmd.exe reads batch files in the OEM code page,
rem  so a UTF-8 em dash or smart quote arrives as garbage bytes - and inside a
rem  parenthesised if/else block those bytes can terminate the block early, after
rem  which cmd starts executing the remaining prose as commands. That is exactly
rem  how the first cut of this file failed ("NOT was unexpected at this time"),
rem  which is also why the branches below are goto labels and not if/else blocks.
rem ============================================================================
setlocal
pushd "%~dp0.."

echo.
echo  Reactor Dynamics - building the portable single-file sim
echo  =======================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

node "tools\make_portable.js"
if errorlevel 1 goto buildfailed

rem ZIP it: several mail providers silently strip or quarantine .html
rem attachments, so the archive is the copy you actually want to send.
rem
rem This step is a CONVENIENCE and is allowed to fail - the .html above is the
rem real deliverable and is already written. But it must never fail SILENTLY: an
rem earlier cut printed "Done. Both files are in dist" after Compress-Archive had
rem errored and produced nothing, which is worse than not zipping at all.
rem The RETRY is not defensive padding. Compress-Archive opens the .html microseconds
rem after Node closed it, and on a real machine an antivirus/indexer scan of a freshly
rem written 2.5 MB file still holds the handle: "The process cannot access the file
rem because it is being used by another process." Measured here on the first run.
echo  Zipping for email...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f = Get-ChildItem 'dist\*.html'; $bad = 0; foreach ($h in $f) { $z = $h.FullName -replace '\.html$','.zip'; if (Test-Path $z) { Remove-Item $z -Force }; $ok = $false; foreach ($try in 1..6) { try { Compress-Archive -LiteralPath $h.FullName -DestinationPath $z -CompressionLevel Optimal -ErrorAction Stop; if (Test-Path $z) { $ok = $true; break } } catch { if ($try -eq 6) { Write-Host ('   zip failed after 6 tries: ' + $_.Exception.Message) } else { Start-Sleep -Milliseconds 700 } } }; if ($ok) { Write-Host ('   ' + (Split-Path $z -Leaf) + '  ' + [math]::Round((Get-Item $z).Length/1MB,2) + ' MB') } else { $bad = 1 } }; exit $bad"
if errorlevel 1 goto nozip

echo.
echo  Done. Both files are in the 'dist' folder:
echo    the .html  - double-click to run the sim, no server and no network
echo    the .zip   - attach THIS one to email
goto finish

:nozip
echo.
echo  Done, BUT ZIPPING FAILED so there is no .zip. The .html in 'dist' is
echo  complete and works; only the email-safe archive is missing.
echo  Zip it by hand: right-click the .html, then Send to, Compressed folder.
goto finish

:nonode
echo  ERROR: Node.js is not on your PATH, so the bundler cannot run.
echo.
echo  The simulator itself does NOT need Node - only this build step does.
echo  Install it from https://nodejs.org  [LTS is fine], reopen this window,
echo  and run this file again.
goto finish

:buildfailed
echo.
echo  BUILD FAILED - see the error above. Nothing was written.

:finish
echo.
popd
pause
endlocal
