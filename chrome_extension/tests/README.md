UI verification uses Node 24 and a disposable headless Edge profile. It serves the real extension pages with mock Chrome APIs and sample notes. No saved notes, real API keys, or external AI services are accessed.

From the extension folder in PowerShell:

```powershell
New-Item -ItemType Directory -Force .preview | Out-Null
Start-Process -FilePath 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' -WindowStyle Hidden -ArgumentList '--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9333',"--user-data-dir=$((Get-Location).Path)/.preview/edge-profile",'about:blank'
node tests/ui-smoke.mjs
```

The checks cover format filtering with search, sort order, visible-note selection, merge dialog dismissal and focus, Hebrew reading direction, upload file selection/removal, settings controls, queue pause/resume, popup navigation, and responsive layouts at 390px. Screenshots are written to `.preview/` (ignored by Git). Allow Edge to start before running the script.

Generation and live site integration still require testing with the unpacked extension and a configured Gemini connection.
