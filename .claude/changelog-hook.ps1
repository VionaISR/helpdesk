$raw = [Console]::In.ReadToEnd()
try { $j = $raw | ConvertFrom-Json } catch { exit 0 }
$f = if ($j.tool_input.file_path) { $j.tool_input.file_path } else { exit 0 }
if ($f -match 'CHANGELOG_v') { exit 0 }
if ($f -notmatch '\\it-helpdesk\\') { exit 0 }
$dir = 'D:\it-helpdesk'
$v = 1
while (Test-Path "$dir\CHANGELOG_v$v.md") { $v++ }
$date = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$content = "# Changelog v$v`n`n**Date:** $date`n**File Changed:** $f`n"
Set-Content -Path "$dir\CHANGELOG_v$v.md" -Value $content -Encoding utf8
