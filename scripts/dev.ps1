<#
.SYNOPSIS
  One-command local development for Universal POS.

.EXAMPLE
  pwsh scripts/dev.ps1          # start services, install deps, migrate, run
  pwsh scripts/dev.ps1 down     # stop Postgres + MinIO
  pwsh scripts/dev.ps1 reset    # stop services and delete their volumes (wipes data)
  pwsh scripts/dev.ps1 app      # build and run the whole stack in containers
#>
[CmdletBinding()]
param(
  [ValidateSet('up', 'down', 'reset', 'app')]
  [string]$Action = 'up'
)

$ErrorActionPreference = 'Stop'
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Log($Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Fail($Message) { Write-Host "ERROR: $Message" -ForegroundColor Red; exit 1 }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'docker is required (https://docs.docker.com/get-docker/)'
}

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  $PnpmCmd = 'pnpm'
  $PnpmPre = @()
} elseif (Get-Command corepack -ErrorAction SilentlyContinue) {
  $PnpmCmd = 'corepack'
  $PnpmPre = @('pnpm')
} else {
  Fail 'pnpm is required; run `corepack enable` first'
}

$ComposeCmd = 'docker'
$ComposePre = @('compose', '-f', 'infra/docker-compose.yml')

# PowerShell 5.1 turns a native command's stderr into a terminating error under
# ErrorActionPreference=Stop, so probe docker behind try/catch.
function Test-DockerDaemon {
  try { & docker info *> $null; return $LASTEXITCODE -eq 0 } catch { return $false }
}

function Test-PostgresReady {
  try {
    & $ComposeCmd @ComposePre exec -T postgres pg_isready -U pos -d pos *> $null
    return $LASTEXITCODE -eq 0
  } catch { return $false }
}

if (-not (Test-DockerDaemon)) {
  Fail 'Docker daemon is not running. Start Docker Desktop and retry.'
}

switch ($Action) {
  'down' {
    Write-Log 'Stopping Postgres and MinIO'
    & $ComposeCmd @ComposePre down
    return
  }
  'reset' {
    Write-Log 'Stopping services and deleting volumes'
    & $ComposeCmd @ComposePre down -v
    return
  }
  'app' {
    Write-Log 'Building and starting the full containerized stack'
    & $ComposeCmd @ComposePre --profile app up --build
    return
  }
}

if (-not (Test-Path .env)) {
  Write-Log 'Creating .env from .env.example'
  Copy-Item .env.example .env
}

# Export .env so drizzle-kit, tsx and the API server all see the same values.
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), 'Process')
}

Write-Log 'Starting Postgres and MinIO'
try {
  & $ComposeCmd @ComposePre up -d
} catch {
  Fail "Failed to start services: $($_.Exception.Message)"
}

Write-Log 'Waiting for Postgres to accept connections'
$attempts = 0
$maxAttempts = 60
do {
  $ready = Test-PostgresReady
  if (-not $ready) {
    $attempts++
    if ($attempts -ge $maxAttempts) {
      Fail 'Postgres did not become ready in time. Check: docker compose -f infra/docker-compose.yml logs postgres'
    }
    Start-Sleep -Seconds 1
  }
} while (-not $ready)

Write-Log 'Installing workspace dependencies'
& $PnpmCmd @PnpmPre install

Write-Log 'Applying database migrations'
& $PnpmCmd @PnpmPre --filter '@pos/db' db:migrate

Write-Log 'Seeding permissions'
& $PnpmCmd @PnpmPre --filter '@pos/db' db:seed

Write-Log 'Starting dev servers - press Ctrl-C to stop'
& $PnpmCmd @PnpmPre dev
