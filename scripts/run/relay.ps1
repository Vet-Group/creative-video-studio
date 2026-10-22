# Relay (plan A.1): the conductor runs this after saving the manifest and stopping its loop, then exits.
# Starts the next conductor detached and moves the lease to it.
& (Join-Path $PSScriptRoot 'start-conductor.ps1') -Force
