<#
  One-command setup for the Federal Grant Fit Scanner.

  Everything here is automated except a single interactive login. That login is
  irreducible: Apify pays out to a KYC-verified identity, and no script can be
  you. After it completes, the actor runs serverlessly on Apify's infrastructure
  and needs nothing further from you or from this machine.

  Usage:   pwsh -File setup.ps1
#>

$ErrorActionPreference = 'Stop'
$ProjectDir = $PSScriptRoot

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn($msg)     { Write-Host "    !!  $msg" -ForegroundColor Yellow }

Write-Host "Federal Grant Fit Scanner - setup" -ForegroundColor White

# ---------------------------------------------------------------- 1. toolchain
Step 1 "Checking toolchain"
try { $nodeV = (node --version) } catch { throw "Node.js not found. Install Node 18+ first." }
Ok "node $nodeV"

if (-not (Get-Command apify -ErrorAction SilentlyContinue)) {
    Warn "apify-cli not found - installing globally"
    npm install -g apify-cli
    if ($LASTEXITCODE -ne 0) { throw "npm install -g apify-cli failed." }
}
Ok "apify-cli present"

# ------------------------------------------------------- 2. prove before ship
Step 2 "Verifying against live federal data before publishing"
Push-Location $ProjectDir
node test/prove.js
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    throw "Verification FAILED. Refusing to publish a build that does not pass its own checks."
}
Pop-Location
Ok "all checks passed"

# ------------------------------------------------------------------ 3. login
Step 3 "Apify login (the one interactive step)"
$whoami = ""
try { $whoami = (apify info 2>$null | Out-String) } catch { }

if ($whoami -match 'username') {
    Ok "already logged in"
} else {
    Write-Host @"

    You need an Apify account. It is free.

      1. Sign up:  https://console.apify.com/sign-up
      2. Get your token:  https://console.apify.com/settings/integrations
      3. Paste it at the prompt below.

    Complete KYC at https://console.apify.com/billing when convenient.
    Without KYC, Apify cannot pay you - the actor still runs, but earnings
    will not be released.

"@ -ForegroundColor Yellow
    apify login
    if ($LASTEXITCODE -ne 0) { throw "apify login failed." }
}
Ok "authenticated"

# ------------------------------------------------------------------- 4. push
Step 4 "Building and pushing the actor to Apify"
Push-Location $ProjectDir
apify push --no-prompt
$pushCode = $LASTEXITCODE
Pop-Location
if ($pushCode -ne 0) { throw "apify push failed." }
Ok "actor built and uploaded"

# --------------------------------------------------------------- 5. next steps
Step 5 "Remaining console steps"
Write-Host @"

    The actor is uploaded. Two settings must be flipped in the web console
    (Apify does not expose monetization or store-publication over the CLI):

      Monetization -> Pay per event
         scan-started          `$0.05
         opportunity-scored    `$0.02

      Publication -> Publish to Apify Store
         Categories: Lead generation, Business
         Description: paste the top of README.md

    Then it is live and self-running. Apify hosts it, bills customers,
    and pays you. This machine does not need to stay on.

    Launch posts are drafted and paste-ready in LAUNCH_KIT.md.

"@ -ForegroundColor White

Ok "setup complete"
