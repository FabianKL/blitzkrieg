<#
.SYNOPSIS
Bouwt en publiceert de spelimage en rolt de Azure-infrastructuur uit.
.DESCRIPTION
Voer eerst az login uit. ACR bouwt de image en slaat hem op; Docker is niet nodig.
Azure CLI vraagt de twee beveiligde Bicep-parameters interactief op.
Het script schrijft geen geheimen naar bestanden of opdrachtargumenten.
.EXAMPLE
.\tools\deploy-azure.ps1 -SubscriptionId '<abonnement-id>' -RegistryName '<unieke-registernaam>'
.EXAMPLE
.\tools\deploy-azure.ps1 -SubscriptionId '<abonnement-id>' -RegistryName '<unieke-registernaam>' -WhatIf
#>

#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [guid]$SubscriptionId,

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-z0-9]{5,50}$', Options = 'None')]
    [string]$RegistryName,

    [ValidatePattern('^(?!-)(?!.*\.$)[a-zA-Z0-9_().-]{1,90}$')]
    [string]$ResourceGroup = 'blitzkrieg-vrienden',

    [ValidatePattern('^[a-z0-9]+$', Options = 'None')]
    [string]$Location = 'westeurope',

    [ValidatePattern('^(?!.*--)[a-z][a-z0-9-]{0,22}[a-z0-9]$', Options = 'None')]
    [string]$AppName = 'blitzkrieg'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

function Invoke-AzureCli {
    param([string[]]$CliArguments, [switch]$Capture)

    if ($Capture) {
        $output = & az @CliArguments
    } else {
        & az @CliArguments | Out-Host
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI mislukt: az $($CliArguments[0..1] -join ' ') (exitcode $LASTEXITCODE). Zie de foutmelding hierboven."
    }
    if ($Capture) { return ($output -join [Environment]::NewLine).Trim() }
}

if ($SubscriptionId -eq [guid]::Empty) { throw 'Geef een geldig abonnements-ID op, niet uitsluitend nullen.' }

$repoRoot = Split-Path -Parent $PSScriptRoot
$registryTemplate = Join-Path $repoRoot 'infra' 'registry.bicep'
$gameTemplate = Join-Path $repoRoot 'infra' 'main.bicep'
$scope = @('--subscription', $SubscriptionId.ToString(), '--only-show-errors')

Write-Warning 'Dit maakt betaalde Azure-resources aan en uploadt de spelbroncode naar je ACR. Deploy alleen tussen spellen: een update kan het lopende spel wissen.'
if (-not $PSCmdlet.ShouldProcess(
    "abonnement $SubscriptionId, resourcegroep $ResourceGroup, regio $Location, register $RegistryName, app $AppName",
    'Registry inrichten, image bouwen/publiceren en spel deployen'
)) { return }

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'Azure CLI ontbreekt. Installeer Azure CLI en meld daarna aan met az login.'
}
foreach ($file in @($registryTemplate, $gameTemplate, (Join-Path $repoRoot 'Dockerfile'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Benodigd bestand ontbreekt: $file" }
}

Write-Host '1/5: abonnement en Bicep controleren (meld zo nodig eerst aan met az login).'
$accountId = Invoke-AzureCli -Capture -CliArguments (@('account', 'show', '--query', 'id', '--output', 'tsv') + $scope)
if ($accountId -ne $SubscriptionId.ToString()) { throw 'Azure CLI geeft een ander abonnement terug. Deployment afgebroken.' }
foreach ($template in @($registryTemplate, $gameTemplate)) {
    $null = Invoke-AzureCli -Capture -CliArguments @('bicep', 'build', '--file', $template, '--stdout', '--only-show-errors')
}

Write-Host '2/5: resourcegroep en containerregister inrichten.'
Invoke-AzureCli -CliArguments (@('group', 'create', '--name', $ResourceGroup, '--location', $Location, '--output', 'none') + $scope)
$loginServer = Invoke-AzureCli -Capture -CliArguments (@(
    'deployment', 'group', 'create', '--resource-group', $ResourceGroup,
    '--name', "$AppName-registry", '--template-file', $registryTemplate,
    '--mode', 'Incremental', '--no-prompt', 'true',
    '--parameters', "registryName=$RegistryName", "location=$Location",
    '--query', 'properties.outputs.loginServer.value', '--output', 'tsv'
) + $scope)
if ([Uri]::CheckHostName($loginServer) -ne [UriHostNameType]::Dns) {
    throw 'De registry-deployment gaf geen geldige loginServer terug.'
}

Write-Host '3/5: image in Azure bouwen en uploaden.'
$imageTag = "spel-$([guid]::NewGuid().ToString('N'))"
$image = "$loginServer/blitzkrieg:$imageTag"
Write-Host "Image: $image"
Invoke-AzureCli -CliArguments (@(
    'acr', 'build', '--registry', $RegistryName, '--resource-group', $ResourceGroup,
    '--image', "blitzkrieg:$imageTag", '--file', 'Dockerfile', '--platform', 'linux/amd64', $repoRoot
) + $scope)

Write-Host '4/5: spel deployen. Azure CLI vraagt nu verborgen om invitePassphrase en sessionSecret; de lengte-eisen staan in de Bicep-template.'
# Laat Azure CLI de secureString-parameters opvragen; geef hun waarden nooit als argument mee.
$gameUrl = Invoke-AzureCli -Capture -CliArguments (@(
    'deployment', 'group', 'create', '--resource-group', $ResourceGroup,
    '--name', "$AppName-game", '--template-file', $gameTemplate,
    '--mode', 'Incremental', '--no-prompt', 'false',
    '--parameters', "appName=$AppName", "registryName=$RegistryName", "image=$image", "location=$Location",
    '--query', 'properties.outputs.gameUrl.value', '--output', 'tsv'
) + $scope)
$gameOrigin = $null
if (-not [Uri]::TryCreate($gameUrl, [UriKind]::Absolute, [ref]$gameOrigin) -or
    $gameOrigin.Scheme -ne 'https' -or $gameOrigin.UserInfo -or
    $gameOrigin.AbsolutePath -ne '/' -or $gameOrigin.Query -or $gameOrigin.Fragment) {
    throw 'De spel-deployment gaf geen geldig HTTPS-adres terug.'
}
$gameUrl = $gameUrl.TrimEnd('/')

Write-Host '5/5: de openbare gezondheidscontrole controleren.'
$health = Invoke-WebRequest -Uri "$gameUrl/healthz" -TimeoutSec 10 -MaximumRetryCount 12 -RetryIntervalSec 5 -MaximumRedirection 0
if ($health.StatusCode -ne 200 -or $health.Content.Trim() -ne 'ok') {
    throw 'De deployment is afgerond, maar de gezondheidscontrole geeft geen geldige spelserver terug.'
}

Write-Host "Deployment en gezondheidscontrole voltooid. Open $gameUrl en meld aan met de uitnodigingszin."
[pscustomobject]@{
    GameUrl = $gameUrl
    Image = $image
    SubscriptionId = $SubscriptionId
    ResourceGroup = $ResourceGroup
}
