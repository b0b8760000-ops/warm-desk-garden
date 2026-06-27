param(
  [string]$Endpoint = "https://sgp.cloud.appwrite.io/v1",
  [string]$ProjectId = "",
  [string]$FunctionId = "warm-desk-garden-api",
  [string]$BucketId = "warm-desk-garden-files",
  [string]$DatabaseName = "warm_desk_garden",
  [string]$BackendEnvPath = ".env.backend.local"
)

$ErrorActionPreference = "Stop"

function Read-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match "^$([regex]::Escape($Key))=" } |
    Select-Object -First 1

  if (-not $line) {
    return ""
  }

  return ($line -replace "^$([regex]::Escape($Key))=", "").Trim()
}

function Read-RequiredValue {
  param(
    [string]$Prompt,
    [string]$Default = ""
  )

  do {
    if ([string]::IsNullOrWhiteSpace($Default)) {
      $value = Read-Host $Prompt
    } else {
      $value = Read-Host "$Prompt [$Default]"
      if ([string]::IsNullOrWhiteSpace($value)) {
        $value = $Default
      }
    }
  } while ([string]::IsNullOrWhiteSpace($value))

  return $value.Trim()
}

function Read-RequiredSecret {
  param(
    [string]$Prompt,
    [string]$Value = ""
  )

  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    return $Value.Trim()
  }

  return Read-SecretValue $Prompt
}

function Read-SecretValue {
  param([string]$Prompt)

  do {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
  } while ([string]::IsNullOrWhiteSpace($value))

  return $value
}

function Normalize-AppwriteProjectId {
  param([string]$ProjectId)

  return ($ProjectId.Trim() -replace "^project-[a-z]+-", "")
}

function Invoke-Appwrite {
  param([string[]]$CliArgs)

  & appwrite @CliArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Appwrite CLI command failed: appwrite $($CliArgs -join ' ')"
  }
}

function Test-AppwriteCommand {
  param([string[]]$CliArgs)

  & appwrite @CliArgs *> $null
  return $LASTEXITCODE -eq 0
}

function Upsert-FunctionVariable {
  param(
    [string]$FunctionId,
    [string]$Key,
    [string]$Value,
    [bool]$Secret = $true
  )

  $args = @(
    "functions", "create-variable",
    "--function-id", $FunctionId,
    "--variable-id", $Key,
    "--key", $Key,
    "--value", $Value
  )

  if ($Secret) {
    $args += @("--secret", "true")
  }

  if (Test-AppwriteCommand $args) {
    return
  }

  $updateArgs = @(
    "functions", "update-variable",
    "--function-id", $FunctionId,
    "--variable-id", $Key,
    "--key", $Key,
    "--value", $Value
  )

  if ($Secret) {
    $updateArgs += @("--secret", "true")
  }

  Invoke-Appwrite $updateArgs
}

if (-not (Get-Command appwrite -ErrorAction SilentlyContinue)) {
  throw "Appwrite CLI is not installed. Run: npm install -g appwrite-cli"
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  $ProjectId = Read-EnvValue -Path ".env.local" -Key "VITE_APPWRITE_PROJECT_ID"
}

$backendProjectId = Read-EnvValue -Path $BackendEnvPath -Key "APPWRITE_PROJECT_ID"
$backendApiKey = Read-EnvValue -Path $BackendEnvPath -Key "APPWRITE_API_KEY"
$backendMongoUri = Read-EnvValue -Path $BackendEnvPath -Key "MONGODB_URI"
$backendEmailTopicId = Read-EnvValue -Path $BackendEnvPath -Key "APPWRITE_EMAIL_TOPIC_ID"

if (-not [string]::IsNullOrWhiteSpace($backendProjectId)) {
  $ProjectId = $backendProjectId
}

$projectId = Normalize-AppwriteProjectId (Read-RequiredValue "Appwrite Project ID" $ProjectId)
$apiKey = Read-RequiredSecret "Appwrite API Key (hidden)" $backendApiKey
$mongoUri = Read-RequiredSecret "MongoDB Atlas MONGODB_URI (hidden)" $backendMongoUri

if ([string]::IsNullOrWhiteSpace($backendEmailTopicId)) {
  $emailTopicId = Read-Host "APPWRITE_EMAIL_TOPIC_ID (optional, press Enter to skip)"
} else {
  $emailTopicId = $backendEmailTopicId.Trim()
}

Write-Host "Configuring Appwrite client for project $projectId..."
Invoke-Appwrite @("client", "--endpoint", $Endpoint, "--project-id", $projectId, "--key", $apiKey)

if (-not (Test-AppwriteCommand @("storage", "get-bucket", "--bucket-id", $BucketId))) {
  Write-Host "Creating Appwrite Storage bucket $BucketId..."
  Invoke-Appwrite @(
    "storage", "create-bucket",
    "--bucket-id", $BucketId,
    "--name", "Warm Desk Garden Files",
    "--permissions", 'read("users")', 'create("users")', 'update("users")', 'delete("users")',
    "--file-security", "false",
    "--enabled", "true",
    "--maximum-file-size", "52428800",
    "--allowed-file-extensions", "jpg", "jpeg", "png", "webp", "gif", "pdf",
    "--compression", "gzip",
    "--encryption", "true",
    "--antivirus", "true"
  )
}

if (-not (Test-AppwriteCommand @("functions", "get", "--function-id", $FunctionId))) {
  Write-Host "Creating Appwrite Function $FunctionId..."
  Invoke-Appwrite @(
    "functions", "create",
    "--function-id", $FunctionId,
    "--name", "Warm Desk Garden API",
    "--runtime", "node-22",
    "--execute", 'users',
    "--timeout", "15",
    "--enabled", "true",
    "--logging", "true",
    "--entrypoint", "dist/index.js",
    "--commands", "npm install && npm run build"
  )
}

Write-Host "Updating Appwrite Function variables..."
Upsert-FunctionVariable -FunctionId $FunctionId -Key "MONGODB_URI" -Value $mongoUri -Secret $true
Upsert-FunctionVariable -FunctionId $FunctionId -Key "MONGODB_DB_NAME" -Value $DatabaseName -Secret $false
Upsert-FunctionVariable -FunctionId $FunctionId -Key "APPWRITE_ENDPOINT" -Value $Endpoint -Secret $false
Upsert-FunctionVariable -FunctionId $FunctionId -Key "APPWRITE_PROJECT_ID" -Value $projectId -Secret $false
Upsert-FunctionVariable -FunctionId $FunctionId -Key "APPWRITE_API_KEY" -Value $apiKey -Secret $true

if (-not [string]::IsNullOrWhiteSpace($emailTopicId)) {
  Upsert-FunctionVariable -FunctionId $FunctionId -Key "APPWRITE_EMAIL_TOPIC_ID" -Value $emailTopicId.Trim() -Secret $false
}

$envLocal = @"
VITE_APPWRITE_ENDPOINT=$Endpoint
VITE_APPWRITE_PROJECT_ID=$projectId
VITE_APPWRITE_BUCKET_ID=$BucketId
VITE_APPWRITE_API_FUNCTION_ID=$FunctionId
"@

Set-Content -Path ".env.local" -Value $envLocal -Encoding UTF8

if (Test-Path -LiteralPath "appwrite.json") {
  $appwriteConfig = Get-Content -LiteralPath "appwrite.json" -Raw | ConvertFrom-Json
  $appwriteConfig.projectId = $projectId
  $appwriteConfig | ConvertTo-Json -Depth 10 | Set-Content -Path "appwrite.json" -Encoding UTF8
}

Write-Host "Deploying Appwrite Function..."
Invoke-Appwrite @(
  "functions", "create-deployment",
  "--function-id", $FunctionId,
  "--code", "functions/api",
  "--activate", "true",
  "--entrypoint", "dist/index.js",
  "--commands", "npm install && npm run build"
)

Write-Host ""
Write-Host "Appwrite resources configured."
Write-Host "Frontend public config was written to .env.local."
Write-Host "Secrets were stored only as Appwrite Function variables, not in .env.local."
Write-Host "Restart npm run dev after the deployment is ready."
