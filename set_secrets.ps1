# Parse .env file manually since we can't rely on generic tools being installed
$envContent = Get-Content -Path "c:\Users\robsa\ColorMeInBooks\.env" -Raw

# Helper to extract value
function Get-EnvValue {
    param($key)
    if ($envContent -match "$key=""([^""]+)""") {
        return $matches[1]
    }
    return $null
}

$STRIPE_KEY = Get-EnvValue "STRIPE_SECRET_KEY"
$LULU_SECRET = Get-EnvValue "LULU_API_SECRET"
$LULU_KEY = Get-EnvValue "LULU_API_KEY"
$RESEND_KEY = Get-EnvValue "RESEND_API_KEY"
$GOOGLE_KEY = Get-EnvValue "GOOGLE_API_KEY"
# LULU_ENVIRONMENT might be production or sandbox
$LULU_ENV = Get-EnvValue "LULU_ENVIRONMENT"
if (-not $LULU_ENV) { $LULU_ENV = "production" }

Write-Host "Setting Supabase secrets..."
Write-Host "Stripe: $STRIPE_KEY"
Write-Host "Lulu Secret: $LULU_SECRET"
Write-Host "Lulu Key: $LULU_KEY"
Write-Host "Resend: $RESEND_KEY"
Write-Host "Google: $GOOGLE_KEY"

# Construct the secrets set command
# Note: Using cmd /c npx to ensure it runs correctly in PowerShell
$secrets = "STRIPE_SECRET_KEY=$STRIPE_KEY", "LULU_API_SECRET=$LULU_SECRET", "LULU_API_KEY=$LULU_KEY", "RESEND_API_KEY=$RESEND_KEY", "GOOGLE_API_KEY=$GOOGLE_KEY", "LULU_ENVIRONMENT=$LULU_ENV"
$secretsStr = $secrets -join ","

Write-Host "Running: npx supabase secrets set $secretsStr"
cmd /c npx supabase secrets set $secretsStr

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Secrets set successfully!"
} else {
    Write-Host "❌ Failed to set secrets. Make sure you are logged in (npx supabase login) and linked to the project."
}
