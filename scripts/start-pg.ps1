# Start the throwaway Postgres cluster used by the verification harness.
# Fast path when it is already up; otherwise starts it with pg_ctl -w.

$pgdata = 'C:\Users\JOHNMA~1\AppData\Local\Temp\opencode\pgdata'
$tmp    = 'C:\Users\JOHNMA~1\AppData\Local\Temp\opencode\pkb_pg'
$pgbin  = 'C:\Program Files\PostgreSQL\17\bin'
$port   = 55432

$pgIsReady = "$pgbin\pg_isready.exe"
$pgCtl     = "$pgbin\pg_ctl.exe"

& $pgIsReady -h 127.0.0.1 -p $port -q
if ($LASTEXITCODE -eq 0) {
  Write-Output 'already_running=true'
  exit 0
}

Remove-Item "$pgdata\postmaster.pid" -Force -ErrorAction SilentlyContinue

& $pgCtl -D $pgdata -o "-p $port" -l "$tmp\server.log" start -w -t 30 | Out-Null
$startRc = $LASTEXITCODE
Write-Output "start_rc=$startRc"

if ($startRc -ne 0) {
  exit $startRc
}

exit 0
