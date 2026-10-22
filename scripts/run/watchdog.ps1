# Watchdog (plan A.0): every 20 minutes, relaunch the conductor only when its heartbeat is older than 45 minutes AND its
# leased process is gone or the PID was reused. Never matches processes by name.
#   pwsh -NoProfile -File scripts/run/watchdog.ps1              one check (the scheduled task runs this)
#   pwsh -NoProfile -File scripts/run/watchdog.ps1 -DryRun      decide and print, start nothing
#   pwsh -NoProfile -File scripts/run/watchdog.ps1 -Register | -Unregister   create or remove CVS-Run-Watchdog
param([switch]$DryRun, [switch]$Register, [switch]$Unregister, [string]$RunDir)
$ErrorActionPreference = 'Stop'
$task = 'CVS-Run-Watchdog'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$cli = Join-Path $root 'scripts\run\cli.ts'

if ($Register) {
  $action = New-ScheduledTaskAction -Execute (Get-Command pwsh).Source -Argument "-NoProfile -WindowStyle Hidden -File `"$PSCommandPath`"" -WorkingDirectory $root
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 20)
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Description 'Creative Video Studio run watchdog (remove at A.2)' | Out-Null
  "registered $task"
  return
}
if ($Unregister) {
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
  "removed $task"
  return
}

# The test passes -RunDir; the scheduled task never does.
if ($RunDir) { $env:CVS_RUN_DIR = $RunDir } else { Remove-Item Env:CVS_RUN_DIR -ErrorAction SilentlyContinue; $RunDir = Join-Path $root '.omc\run' }
$log = Join-Path $RunDir 'logs\watchdog.log'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

$lease = $null
$lock = Join-Path $RunDir 'conductor.lock'
if (Test-Path $lock) { $lease = Get-Content $lock -Raw | ConvertFrom-Json }
$procStarted = 'none'
if ($lease) {
  $proc = Get-Process -Id $lease.pid -ErrorAction SilentlyContinue
  if ($proc) { $procStarted = $proc.StartTime.ToUniversalTime().ToString('o') }
}
$why = & node $cli should-relaunch --proc-started $procStarted
$relaunch = $LASTEXITCODE -eq 0
$line = "$((Get-Date).ToUniversalTime().ToString('o')) relaunch=$relaunch $why"
Add-Content $log $line
if (-not $relaunch) { $line; return }
if ($DryRun) { "WOULD RELAUNCH: $why"; return }
& (Join-Path $PSScriptRoot 'start-conductor.ps1') -Force
& node $cli notify "watchdog đã mở lại conductor ($why)" | Out-Null
