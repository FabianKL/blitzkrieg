<#
.SYNOPSIS
Bouwt en publiceert de spelimage en rolt de Azure-infrastructuur uit.
.DESCRIPTION
Voer eerst az login uit. ACR bouwt de image en slaat hem op; Docker is niet nodig.
Azure CLI vraagt de twee beveiligde Bicep-parameters interactief op, of leest ze
via ConfigFile uit een lokaal JSON-bestand buiten de repo. Dat bestand bevat leesbare geheimen.
Het script schrijft geen geheimwaarden naar opdrachtargumenten of extra bestanden.
.EXAMPLE
.\tools\deploy-azure.ps1 -SubscriptionId '<abonnement-id>' -RegistryName '<unieke-registernaam>'
.EXAMPLE
.\tools\deploy-azure.ps1 -SubscriptionId '<abonnement-id>' -RegistryName '<unieke-registernaam>' -WhatIf
.EXAMPLE
.\tools\deploy-azure.ps1 -ConfigFile 'C:\Blitzkrieg\azure-input.local.json'
#>

#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High', DefaultParameterSetName = 'Interactive')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Interactive')]
    [guid]$SubscriptionId,

    [Parameter(Mandatory, ParameterSetName = 'Interactive')]
    [ValidatePattern('^[a-z0-9]{5,50}$', Options = 'None')]
    [string]$RegistryName,

    [Parameter(ParameterSetName = 'Interactive')]
    [ValidatePattern('^(?!-)(?!.*\.$)[a-zA-Z0-9_().-]{1,90}$')]
    [string]$ResourceGroup = 'blitzkrieg-vrienden',

    [Parameter(ParameterSetName = 'Interactive')]
    [ValidatePattern('^[a-z0-9]+$', Options = 'None')]
    [string]$Location = 'westeurope',

    [Parameter(ParameterSetName = 'Interactive')]
    [ValidatePattern('^(?!.*--)[a-z][a-z0-9-]{0,22}[a-z0-9]$', Options = 'None')]
    [string]$AppName = 'blitzkrieg',

    [Parameter(Mandatory, ParameterSetName = 'File')]
    [ValidateNotNullOrEmpty()]
    [string]$ConfigFile
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

$repoRoot = Split-Path -Parent $PSScriptRoot
$secureParameters = @()
$noPrompt = 'false'
if ($PSCmdlet.ParameterSetName -eq 'File') {
    if (-not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) {
        throw 'ConfigFile moet een bestaand JSON-bestand zijn.'
    }
    $file = Get-Item -LiteralPath $ConfigFile
    if ($file -isnot [IO.FileInfo] -or $file.Extension -ine '.json') {
        throw 'ConfigFile moet een bestaand JSON-bestand zijn.'
    }
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'ConfigFile mag geen symbolische koppeling zijn.'
    }
    for ($directory = $file.Directory; $null -ne $directory; $directory = $directory.Parent) {
        if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Bewaar ConfigFile buiten symbolische koppelingen en junctions.'
        }
    }
    $comparison = if ($IsWindows) { [StringComparison]::OrdinalIgnoreCase } else { [StringComparison]::Ordinal }
    if ($file.FullName.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, $comparison)) {
        throw 'Bewaar ConfigFile buiten de repo: het bevat leesbare geheimen.'
    }
    try {
        $config = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($file.FullName)) -AsHashtable
    } catch [ArgumentException] {
        throw 'ConfigFile bevat geen geldige JSON. De inhoud wordt niet getoond omdat die geheimen kan bevatten.'
    }
    if ($config -isnot [System.Collections.IDictionary]) { throw 'ConfigFile moet een JSON-object bevatten.' }
    $settings = @{
        SubscriptionId = $SubscriptionId; RegistryName = $RegistryName
        ResourceGroup = $ResourceGroup; Location = $Location; AppName = $AppName
    }
    foreach ($key in $config.Keys) {
        if ($key -cne 'parameters' -and @($settings.Keys) -cnotcontains $key) {
            throw 'ConfigFile bevat onbekende eigenschappen. Gebruik de namen uit het voorbeeldbestand.'
        }
    }
    foreach ($name in @('SubscriptionId', 'RegistryName')) {
        if (-not $config.Contains($name)) { throw "ConfigFile mist $name." }
    }
    foreach ($name in @($settings.Keys)) {
        if (-not $config.Contains($name)) { continue }
        $value = $config[$name]
        if ($value -isnot [string]) { throw "ConfigFile moet een tekstwaarde voor $name bevatten." }
        if ($name -eq 'SubscriptionId') {
            $id = [guid]::Empty
            if (-not [guid]::TryParse($value, [ref]$id)) { throw 'ConfigFile bevat geen geldig abonnements-ID.' }
            $settings[$name] = $id
        } else {
            $pattern = $MyInvocation.MyCommand.Parameters[$name].Attributes |
                Where-Object { $_ -is [System.Management.Automation.ValidatePatternAttribute] }
            if (-not [regex]::IsMatch($value, $pattern.RegexPattern, $pattern.Options)) {
                throw "ConfigFile bevat een ongeldige waarde voor $name."
            }
            $settings[$name] = $value
        }
    }
    $secrets = $config['parameters']
    if ($secrets -isnot [System.Collections.IDictionary] -or $secrets.Count -ne 2) {
        throw 'ConfigFile moet onder parameters uitsluitend invitePassphrase en sessionSecret bevatten.'
    }
    foreach ($secret in @(@{ Name = 'invitePassphrase'; Minimum = 16 }, @{ Name = 'sessionSecret'; Minimum = 32 })) {
        $parameter = $secrets[$secret.Name]
        if ($parameter -isnot [System.Collections.IDictionary] -or $parameter.Count -ne 1 -or
            -not $parameter.Contains('value') -or $parameter['value'] -isnot [string] -or
            $parameter['value'].Length -lt $secret.Minimum) {
            throw "ConfigFile moet $($secret.Name) met een tekstwaarde van minstens $($secret.Minimum) tekens bevatten."
        }
    }
    $SubscriptionId = $settings.SubscriptionId
    $RegistryName = $settings.RegistryName
    $ResourceGroup = $settings.ResourceGroup
    $Location = $settings.Location
    $AppName = $settings.AppName
    $secureParameters = @("@$($file.FullName)")
    $noPrompt = 'true'
    Write-Warning 'ConfigFile bevat leesbare geheimen. Beperk de bestandstoegang en deel of commit het bestand nooit.'
}
if ($SubscriptionId -eq [guid]::Empty) { throw 'Geef een geldig abonnements-ID op, niet uitsluitend nullen.' }

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

if ($secureParameters.Count) {
    Write-Host '4/5: spel deployen met de beveiligde parameters uit ConfigFile.'
} else {
    Write-Host '4/5: spel deployen. Azure CLI vraagt nu verborgen om invitePassphrase en sessionSecret; de lengte-eisen staan in de Bicep-template.'
}
# Alleen de bestandsnaam of de verborgen invoer gaat naar Azure CLI, nooit geheimwaarden als argument.
$gameUrl = Invoke-AzureCli -Capture -CliArguments (@(
    'deployment', 'group', 'create', '--resource-group', $ResourceGroup,
    '--name', "$AppName-game", '--template-file', $gameTemplate,
    '--mode', 'Incremental', '--no-prompt', $noPrompt,
    '--parameters'
) + $secureParameters + @(
    "appName=$AppName", "registryName=$RegistryName", "image=$image", "location=$Location",
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
