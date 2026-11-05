#requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$deployScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'tools' 'deploy-azure.ps1'
$subscription = '11111111-1111-1111-1111-111111111111'
$failed = 0

function Assert-True($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Assert-Throws([scriptblock]$Action, [string]$Pattern) {
    $failure = $null
    try { & $Action | Out-Null } catch { $failure = $_ }
    Assert-True ($null -ne $failure) 'De opdracht had moeten mislukken.'
    Assert-True ($failure.Exception.Message -match $Pattern) "Onverwachte fout: $($failure.Exception.Message)"
}

function Get-Argument([string[]]$Call, [string]$Name) {
    $index = [array]::IndexOf($Call, $Name)
    if ($index -lt 0) { throw "Argument ontbreekt: $Name" }
    return $Call[$index + 1]
}

function Get-Command {
    param($Name, $ErrorAction)
    if ($Name -ne 'az') { throw "Onverwachte gereedschapscontrole: $Name" }
    if (-not $global:DeploymentTestState.MissingCli) { [pscustomobject]@{ Name = 'az' } }
}

function az {
    $call = [string[]]$args
    $global:DeploymentTestState.Calls.Add($call)
    $global:LASTEXITCODE = 0
    if ($global:DeploymentTestState.Calls.Count -eq $global:DeploymentTestState.FailAt) {
        $global:LASTEXITCODE = 17
        return
    }
    switch ($call[0..1] -join ' ') {
        'account show' { return $global:DeploymentTestState.AccountId }
        'bicep build' {
            Assert-True ($call -contains '--stdout') 'Bicep mag geen JSON-bestanden schrijven.'
            return '{}'
        }
        'group create' { return }
        'acr build' { return }
        'deployment group' {
            $template = Get-Argument $call '--template-file'
            if ($template.EndsWith('registry.bicep')) { return $global:DeploymentTestState.LoginServer }
            if ($template.EndsWith('main.bicep')) { return $global:DeploymentTestState.GameUrl }
            throw "Onverwachte template: $template"
        }
        default { throw "Onverwachte Azure CLI-opdracht: $($call -join ' ')" }
    }
}

function Invoke-WebRequest {
    param($Uri, $TimeoutSec, $MaximumRetryCount, $RetryIntervalSec, $MaximumRedirection)
    $global:DeploymentTestState.HealthCalls++
    Assert-True ($Uri -eq "$($global:DeploymentTestState.GameUrl.TrimEnd('/'))/healthz") 'De verkeerde gezondheidscontrole is aangeroepen.'
    Assert-True ($MaximumRetryCount -gt 0) 'Tijdelijke HTTP-fouten moeten begrensd opnieuw worden geprobeerd.'
    Assert-True ($TimeoutSec -gt 0) 'De gezondheidscontrole moet een timeout hebben.'
    Assert-True ($MaximumRedirection -eq 0) 'De gezondheidscontrole mag niet doorverwijzen.'
    if ($global:DeploymentTestState.HealthFailure) { throw [System.Net.Http.HttpRequestException]::new('Nagebootste netwerkfout.') }
    return [pscustomobject]@{ StatusCode = 200; Content = $global:DeploymentTestState.HealthContent }
}

function Invoke-TestDeployment([hashtable]$Overrides = @{}) {
    $parameters = @{
        SubscriptionId = $script:subscription
        RegistryName = 'voorbeeld123'
        Confirm = $false
    }
    foreach ($key in $Overrides.Keys) { $parameters[$key] = $Overrides[$key] }
    & $script:deployScript @parameters 6>$null 3>$null
}

function Test-Deployment([string]$Name, [scriptblock]$Body) {
    $global:DeploymentTestState = @{
        Calls = [System.Collections.Generic.List[object]]::new()
        AccountId = $script:subscription
        LoginServer = 'voorbeeld123-uniekehash.azurecr.io'
        GameUrl = 'https://blitzkrieg.voorbeeld.azurecontainerapps.io'
        FailAt = -1
        HealthCalls = 0
        HealthFailure = $false
        HealthContent = 'ok'
        MissingCli = $false
    }
    try {
        & $Body
        Write-Host "OK: $Name"
    } catch {
        $script:failed++
        Write-Host "FOUT: $Name - $($_.Exception.Message)"
    } finally {
        Remove-Variable -Name DeploymentTestState -Scope Global
    }
}

Test-Deployment 'hulptekst en voorbeelden zijn aan het script gekoppeld' {
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($script:deployScript, [ref]$tokens, [ref]$errors)
    Assert-True ($errors.Count -eq 0) 'Het script heeft syntaxisfouten.'
    $help = $ast.GetHelpContent()
    Assert-True ($null -ne $help) 'De script-hulptekst ontbreekt.'
    Assert-True ($help.Synopsis.Length -gt 0 -and $help.Examples.Count -gt 0) 'Beschrijving of voorbeelden ontbreken.'
    Assert-True (($help.Examples -join "`n") -notmatch 'requires -Version') 'De versievereiste hoort niet bij de voorbeelden.'
}

Test-Deployment 'de gecompileerde omgeving laat logopslag weg zonder Log Analytics-workspace' {
    $azureCli = Microsoft.PowerShell.Core\Get-Command az -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $templatePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'infra' 'main.bicep'
    $json = & $azureCli.Source bicep build --file $templatePath --stdout --only-show-errors
    Assert-True ($LASTEXITCODE -eq 0) 'De echte Bicep-compilatie is mislukt.'
    $template = ($json -join [Environment]::NewLine) | ConvertFrom-Json
    $environments = @($template.resources | Where-Object { $_.type -eq 'Microsoft.App/managedEnvironments' })
    Assert-True ($environments.Count -eq 1) 'De Container Apps-omgeving ontbreekt of komt meermaals voor.'
    Assert-True ($null -eq $environments[0].properties.PSObject.Properties['appLogsConfiguration']) 'Logopslag moet ontbreken; de tekst none wordt door Azure geweigerd.'
    $workspaces = @($template.resources | Where-Object { $_.type -eq 'Microsoft.OperationalInsights/workspaces' })
    Assert-True ($workspaces.Count -eq 0) 'Er wordt onbedoeld een Log Analytics-workspace aangemaakt.'
}

Test-Deployment 'WhatIf doet geen Azure-aanroepen en geen gezondheidscontrole' {
    $result = @(Invoke-TestDeployment @{ WhatIf = $true })
    Assert-True ($global:DeploymentTestState.Calls.Count -eq 0) 'WhatIf heeft Azure CLI aangeroepen.'
    Assert-True ($global:DeploymentTestState.HealthCalls -eq 0) 'WhatIf heeft een netwerkcontrole uitgevoerd.'
    Assert-True ($result.Count -eq 0) 'WhatIf heeft een succesvolle deployment teruggegeven.'
}

Test-Deployment 'bouw, upload, deployment en gezondheidscontrole in de juiste volgorde' {
    $callerLocation = (Get-Location).Path
    $result = Invoke-TestDeployment
    Assert-True ($global:DeploymentTestState.Calls.Count -eq 7) 'Onverwacht aantal Azure CLI-aanroepen.'
    Assert-True (($global:DeploymentTestState.Calls[3][0..1] -join ' ') -eq 'group create') 'Resourcegroep niet voor registry ingericht.'
    Assert-True ($global:DeploymentTestState.Calls[4] -contains (Join-Path (Split-Path -Parent $PSScriptRoot) 'infra' 'registry.bicep')) 'Registry-template ontbreekt.'
    Assert-True (($global:DeploymentTestState.Calls[5][0..1] -join ' ') -eq 'acr build') 'Image niet tussen registry- en spel-deployment gebouwd.'
    Assert-True ($result.GameUrl -eq $global:DeploymentTestState.GameUrl) 'De spel-URL ontbreekt.'
    Assert-True ($result.Image.StartsWith("$($global:DeploymentTestState.LoginServer)/blitzkrieg:spel-")) 'Het werkelijke registry-adres is niet gebruikt.'
    Assert-True ($global:DeploymentTestState.HealthCalls -eq 1) 'De gezonde server is niet gecontroleerd.'
    Assert-True ((Get-Location).Path -eq $callerLocation) 'De werkmap van de aanroeper is veranderd.'
    foreach ($call in $global:DeploymentTestState.Calls) {
        if ($call[0] -eq 'bicep') { continue }
        Assert-True ((Get-Argument $call '--subscription') -eq $script:subscription) 'Een Azure-aanroep mist het expliciete abonnement.'
    }
}

Test-Deployment 'werkt ook vanuit een andere werkmap en geeft Linux als doelplatform op' {
    Push-Location ([IO.Path]::GetTempPath())
    try {
        $null = Invoke-TestDeployment
        $build = $global:DeploymentTestState.Calls[5]
        Assert-True ($build -contains (Split-Path -Parent $PSScriptRoot)) 'De buildcontext is niet de projectmap.'
        Assert-True ((Get-Argument $build '--file') -eq 'Dockerfile') 'De verkeerde Dockerfile is gebruikt.'
        Assert-True ((Get-Argument $build '--platform') -eq 'linux/amd64') 'Het doelplatform is niet Linux/amd64.'
    } finally { Pop-Location }
}

Test-Deployment 'geheimen blijven buiten CLI-argumenten; Azure CLI vraagt ze verborgen op' {
    $null = Invoke-TestDeployment
    foreach ($call in $global:DeploymentTestState.Calls) {
        Assert-True (($call -join ' ') -notmatch 'invitePassphrase=|sessionSecret=|--debug|--no-push') 'Een geheim of onveilige vlag staat in de argumenten.'
    }
    $main = $global:DeploymentTestState.Calls[6]
    Assert-True ((Get-Argument $main '--no-prompt') -eq 'false') 'De beveiligde invoer is uitgeschakeld.'
    Assert-True ((Get-Argument $main '--query') -eq 'properties.outputs.gameUrl.value') 'De uitvoer is niet tot het speladres beperkt.'
    Assert-True ((Get-Argument $main '--mode') -eq 'Incremental') 'De deployment kan onbedoeld andere resources verwijderen.'
}

Test-Deployment 'iedere uitvoering krijgt een nieuwe image-tag' {
    $first = Invoke-TestDeployment
    $second = Invoke-TestDeployment
    Assert-True ($first.Image -ne $second.Image) 'Een bestaande image-tag wordt hergebruikt.'
}

Test-Deployment 'eigen resourcegroep, regio en appnaam gaan naar alle juiste stappen' {
    $result = Invoke-TestDeployment @{ ResourceGroup = 'andere-groep'; Location = 'northeurope'; AppName = 'ander-spel' }
    Assert-True ($result.ResourceGroup -eq 'andere-groep') 'De standaardresourcegroep is onbedoeld gebruikt.'
    foreach ($index in @(4, 6)) {
        Assert-True ($global:DeploymentTestState.Calls[$index] -contains 'location=northeurope') 'De expliciete regio ontbreekt.'
        Assert-True ((Get-Argument $global:DeploymentTestState.Calls[$index] '--resource-group') -eq 'andere-groep') 'De verkeerde resourcegroep is gebruikt.'
    }
    Assert-True ($global:DeploymentTestState.Calls[6] -contains 'appName=ander-spel') 'De appnaam ontbreekt in de spel-deployment.'
}

foreach ($step in 1..7) {
    Test-Deployment "CLI-fout in stap $step breekt af zonder volgende stappen" {
        $global:DeploymentTestState.FailAt = $step
        Assert-Throws { Invoke-TestDeployment } 'Azure CLI mislukt:.*exitcode 17'
        Assert-True ($global:DeploymentTestState.Calls.Count -eq $step) 'De automatisering ging na een fout verder.'
        Assert-True ($global:DeploymentTestState.HealthCalls -eq 0) 'Na een fout is toch succes gecontroleerd.'
    }
}

Test-Deployment 'een ander abonnement breekt af voordat resources worden gemaakt' {
    $global:DeploymentTestState.AccountId = '22222222-2222-2222-2222-222222222222'
    Assert-Throws { Invoke-TestDeployment } 'ander abonnement'
    Assert-True ($global:DeploymentTestState.Calls.Count -eq 1) 'Na een onjuist abonnement is doorgegaan.'
}

Test-Deployment 'ontbrekende Azure CLI geeft een gerichte foutmelding' {
    $global:DeploymentTestState.MissingCli = $true
    Assert-Throws { Invoke-TestDeployment } 'Azure CLI ontbreekt'
    Assert-True ($global:DeploymentTestState.Calls.Count -eq 0) 'Azure CLI is ondanks de mislukte controle aangeroepen.'
}

Test-Deployment 'ongeldige namen en een leeg abonnements-ID stoppen voor de deployment' {
    foreach ($name in @('TeKort', 'ab', 'naam-met-streepje')) {
        Assert-Throws { Invoke-TestDeployment @{ RegistryName = $name } } 'RegistryName'
    }
    foreach ($name in @('Ongeldig', 'dubbel--streepje', 'eind-', '-begin')) {
        Assert-Throws { Invoke-TestDeployment @{ AppName = $name } } 'AppName'
    }
    Assert-Throws { Invoke-TestDeployment @{ SubscriptionId = [guid]::Empty } } 'geldig abonnements-ID'
    Assert-True ($global:DeploymentTestState.Calls.Count -eq 0) 'Ongeldige invoer leidde tot Azure-aanroepen.'
}

Test-Deployment 'ontbrekend registry-adres geeft geen succesvormige image terug' {
    $global:DeploymentTestState.LoginServer = ''
    Assert-Throws { Invoke-TestDeployment } 'geldige loginServer'
    Assert-True ($global:DeploymentTestState.Calls.Count -eq 5) 'Zonder registry-adres is een image gebouwd.'
}

Test-Deployment 'een ongeldig of onveilig speladres stopt voor de gezondheidscontrole' {
    foreach ($url in @('', 'http://spel.example', 'https://spel.example/pad', 'https://spel.example/?geheim=onjuist')) {
        $global:DeploymentTestState.GameUrl = $url
        Assert-Throws { Invoke-TestDeployment } 'geldig HTTPS-adres'
    }
    Assert-True ($global:DeploymentTestState.HealthCalls -eq 0) 'Een ongeldig speladres is benaderd.'
}

Test-Deployment 'een afsluitende slash in het speladres wordt genormaliseerd' {
    $global:DeploymentTestState.GameUrl += '/'
    $result = Invoke-TestDeployment
    Assert-True ($result.GameUrl -notmatch '/$') 'Het speladres houdt een dubbele slash bij de gezondheidscontrole.'
}

Test-Deployment 'netwerkfout of onverwachte gezondheidsinhoud geeft geen succesvolle deployment terug' {
    $global:DeploymentTestState.HealthFailure = $true
    Assert-Throws { Invoke-TestDeployment } 'Nagebootste netwerkfout'
    $global:DeploymentTestState.HealthFailure = $false
    $global:DeploymentTestState.HealthContent = '<html>Geen spelserver</html>'
    Assert-Throws { Invoke-TestDeployment } 'gezondheidscontrole geeft geen geldige spelserver'
}

if ($failed) { throw "$failed deploymenttests mislukt." }
Write-Host 'Alle deploymenttests geslaagd; er zijn geen Azure-resources aangemaakt.'
