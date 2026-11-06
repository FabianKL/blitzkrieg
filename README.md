# BLITZKRIEG – Tunneler in de Tweede Wereldoorlog (2–4 spelers)

## Starten
```
npm install
npm start
```
Open `http://localhost:3000`. Andere laptops in hetzelfde netwerk openen het adres dat de server
toont (bijv. `http://192.168.1.82:3000`). Sta Node.js toe in de Windows-firewall als daarom gevraagd
wordt. Is poort 3000 bezet, start dan op een andere: `PORT=3001 npm start` (PowerShell:
`$env:PORT=3001; npm start`). Het originele Tunneler staat op `/retro`.

## Via internet met vrienden (Azure)

De website en de echte simulatie draaien samen in **een Node.js-proces**. Voor een klein groepje
zijn een resourcegroep, een **Container Apps-omgeving (Consumption)**, een **Container App** en een
containerregister voldoende. De app krijgt een HTTPS-adres en ondersteunt WSS; een eigen domein,
database, opslagaccount, Kubernetes, aparte load balancer of Azure SignalR is niet nodig.
Alle spelers openen hetzelfde adres. De gewone wachtkamer blijft een gezamenlijk spel voor
maximaal vier spelers (kleine kaart: twee), geen verzameling afzonderlijke uitnodigingskamers.

`infra/main.bicep` begint met **0,5 vCPU / 1 GiB RAM**, een actieve revisie en precies een replica.
Dit is een startpunt: meet voor gebruik met vier spelers op de grootste kaart of de server
30 ticks/s blijft halen (ongeveer 33 ms per tick). Verhoog zo nodig de resources.
Niet horizontaal schalen: alle speltoestand zit in het geheugen. Een herstart, nieuwe versie,
platformvervanging of uitschakeling verbreekt de verbindingen en wist het lopende spel.
Werk de app daarom alleen bij tussen spellen. Ook in Single-modus kunnen tijdens een update
kort oude en nieuwe replicas naast elkaar bestaan; Single-modus is geen gedeelde spelopslag.

### Uitnodigingszin

Lokaal blijft `npm start` zonder aanmelding werken. **Zet de lokale modus niet rechtstreeks op
internet.** De container gebruikt `NODE_ENV=production` en weigert zonder toegangsinstellingen
te starten:

| Omgevingsvariabele | Betekenis |
|---|---|
| `TUNNELER_AUTH` | `required` voor internet; `local` uitsluitend voor lokaal spelen. Productie staat `local` niet toe. |
| `APP_ORIGIN` | Exact het HTTPS-adres zonder afsluitende slash, bijvoorbeeld `https://naam.domein`. |
| `INVITE_PASSPHRASE` | Willekeurige gedeelde uitnodigingszin van minstens 16 tekens. Deel apart van het adres. |
| `SESSION_SECRET` | Afzonderlijk willekeurig geheim van minstens 32 tekens, nooit aan spelers geven. |

De Azure-template stelt deze waarden in en gebruikt Container Apps-secrets. Sla geheimen niet
op in de broncode, een gecommit bestand, de image, de URL of shellgeschiedenis.
Een lokaal invoerbestand buiten de repo is mogelijk; zie hieronder. De aanmelding
geeft een ondertekende cookie (Secure, HttpOnly, SameSite=Strict) die acht uur geldig is.
Zowel spelbestanden als WebSocket-verbindingen vereisen die cookie; voor nieuwe WebSockets moet
ook de Origin exact overeenkomen. Bestaande verbindingen sluiten bij het verlopen van de sessie
uiterlijk bij de volgende hartslag. Meld daarna opnieuw aan en herlaad de pagina.
Alleen `/login` en de minimale `/healthz`-controle zijn openbaar.

Na twintig foute aanmeldingen binnen een minuut geldt tijdelijk een globale blokkade; deze is
bewust niet afhankelijk van vervalsbare proxy/IP-headers. Ook de juiste zin kan dan tot het
einde van die minuut niet aanmelden. De limiet wordt bij een herstart gewist.
Een gedeelde zin kent geen individuele accounts of intrekking per persoon. Roteer de
uitnodigingszin of het sessiegeheim en **herstart de actieve revisie** om alle oude sessies
ongeldig te maken. Dat onderbreekt ook het spel. Alleen een secret wijzigen zonder herstart
werkt niet door in het bestaande proces.

### Bouwen en deployen met een script

Gebruik `tools/deploy-azure.ps1` vanuit de VS Code-terminal met **PowerShell 7 of nieuwer**.
Vereist: Azure CLI met Bicep, een Azure-abonnement en rechten om resources en de `AcrPull`-roltoekenning
te maken (bijvoorbeeld Owner op de resourcegroep; voor een nieuwe resourcegroep zijn ook
voldoende rechten op het abonnement nodig). Alleen Contributor is voor de roltoekenning niet genoeg.

```powershell
az login
pwsh -NoProfile -File .\tools\deploy-azure.ps1 `
  -SubscriptionId '<abonnement-id>' `
  -RegistryName '<globaal-unieke-registernaam>'
```

Het script toont het doel en vraagt bevestiging: het maakt **betaalde resources** en uploadt de
spelbroncode naar je eigen Azure-register. Het:

1. controleert het expliciete abonnement en compileert beide Bicep-templates;
2. maakt of actualiseert de resourcegroep en het register;
3. bouwt de Linux/amd64-image **in ACR** en publiceert die automatisch, met een nieuwe unieke tag;
4. deployt `infra/main.bicep`;
5. controleert de HTTPS-gezondheidsroute en toont `GameUrl` en de gebruikte image.

Een lokale Docker-engine is hiervoor niet nodig. Het script gebruikt de projectmap naast het
script als buildcontext, ook als je het vanuit een andere werkmap aanroept. Iedere Azure-opdracht
krijgt het opgegeven abonnements-ID mee; je standaardabonnement wordt niet gewijzigd.
De standaardwaarden zijn resourcegroep `blitzkrieg-vrienden`, regio `westeurope` en app `blitzkrieg`.
Je kunt ze veranderen met `-ResourceGroup`, `-Location` en `-AppName`.
De registernaam bevat 5-50 kleine letters of cijfers en moet globaal uniek zijn.

Vooraf alleen het doel bekijken, **zonder Azure-aanroepen of kosten**:

```powershell
pwsh -NoProfile -File .\tools\deploy-azure.ps1 `
  -SubscriptionId '<abonnement-id>' `
  -RegistryName '<globaal-unieke-registernaam>' -WhatIf
```

Deze `-WhatIf` is geen Azure-wijzigingsanalyse of kostenraming: hij toont alleen wat het script
zou uitvoeren. Met `-Confirm:$false` kun je de bevestigingsvraag overslaan. Zonder invoerbestand
blijft de beveiligde invoer van geheimen nodig. Het script regelt geen onbeheerde Azure-aanmelding
voor CI; `az login` en de juiste rechten blijven vereist.

Azure CLI vraagt bij de spel-deployment verborgen om `invitePassphrase` en `sessionSecret`.
Voer de waarden daar in, nooit als opdrachtargument. Zonder invoerbestand leest of bewaart het
script deze waarden niet zelf. De bestaande Bicep-parameters zijn `@secure()`.
Bewaar je gekozen waarden in een wachtwoordmanager voor volgende uitvoeringen.

#### Alle waarden via een lokaal invoerbestand

Kopieer `infra/deploy-input.example.json` naar een plaats **buiten de repo**, bijvoorbeeld
`C:\Blitzkrieg\azure-input.local.json`. Vul `SubscriptionId`, `RegistryName` en de twee
`parameters`-velden in: `invitePassphrase.value` (minstens 16 tekens) en
`sessionSecret.value` (minstens 32 tekens). Gebruik twee verschillende geheimen.
`ResourceGroup`, `Location` en `AppName` zijn optioneel en hebben dezelfde standaardwaarden
als de losse argumenten.

```powershell
pwsh -NoProfile -File .\tools\deploy-azure.ps1 `
  -ConfigFile 'C:\Blitzkrieg\azure-input.local.json'
```

Je hoeft de instellingen en geheimen dan niet bij elke uitvoering opnieuw in te voeren.
De bevestiging voor betaalde resources blijft; `-Confirm:$false` slaat die over.
`-WhatIf` leest en valideert het bestand, maar doet geen Azure-aanroepen.
Combineer `-ConfigFile` niet met losse instellingen zoals `-SubscriptionId` of `-RegistryName`.
Relatieve bestandspaden worden vanuit de huidige terminalmap opgezocht.

**Dit bestand is niet versleuteld.** `@secure()` in Bicep versleutelt het lokale bestand niet.
Beperk de toegang tot je eigen account en deel of commit het nooit. Het script weigert bestanden
binnen de repo en paden via symbolische koppelingen of junctions; `azure-input.local.json` staat
ook in `.gitignore` als extra bescherming. Het script maakt geen kopie of tijdelijk geheimenbestand:
Azure CLI leest alleen het onderdeel `parameters` rechtstreeks uit het bestand. De andere velden
zijn instellingen voor het script. Geheimwaarden komen niet als opdrachtargument mee.

Elke uitvoering bouwt een nieuwe image en kan een bestaand spel onderbreken. Deploy daarom
alleen tussen spellen. Bij een fout stopt het script direct; al gemaakte resources en geuploade
images blijven bestaan en kunnen kosten geven. Er is bewust geen automatische verwijdering.
De HTTPS-gezondheidscontrole bewijst niet dat een langdurige WSS-sessie met vier spelers werkt;
controleer dat apart na de eerste echte uitrol.

### Handmatig inrichten (alternatief)

Vereist: Azure CLI met Bicep en Container Apps-ondersteuning, een gekozen abonnement, en rechten om
resources te maken en de rol `AcrPull` toe te kennen. De commands hieronder maken **betaalde
resources** en uploaden de spelbroncode naar je eigen Azure Container Registry. Voer ze alleen
uit in het bedoelde abonnement. Er wordt geen lokale Docker-engine gebruikt: ACR bouwt de image.

PowerShell, vanuit de projectmap:

```powershell
az login
az account set --subscription '<abonnement-id>'
$groep = 'blitzkrieg-vrienden'
$regio = 'westeurope' # kies een regio dicht bij de spelers
$register = '<globaal-unieke-naam-met-letters-en-cijfers>'
$app = 'blitzkrieg'
$tag = 'spel-v1' # gebruik voor elke nieuwe versie een nieuwe tag

az group create --name $groep --location $regio
az deployment group create --resource-group $groep --template-file .\infra\registry.bicep --parameters registryName=$register
az acr build --registry $register --image "blitzkrieg:$tag" .
$image = "${register}.azurecr.io/blitzkrieg:$tag"

az deployment group create --resource-group $groep --template-file .\infra\main.bicep --parameters appName=$app registryName=$register image=$image
```

Laat de laatste opdracht de ontbrekende beveiligde parameters `invitePassphrase` en
`sessionSecret` interactief vragen. Geef ze niet als argument mee en gebruik geen `--debug`.
Als je omgeving geen veilige invoer ondersteunt, gebruik dan de beveiligde parametervelden van
Azure Portal voor een aangepaste ARM-deployment, of de expliciete `-ConfigFile`-route hierboven.
Ook bij die bestandsroute moeten de leesbare geheimen buiten de repo blijven.
De uitvoer bevat `gameUrl`. Open die URL, meld aan, en controleer met vrienden op verschillende
internetverbindingen of een spel langer dan tien minuten zonder onderbreking werkt.
De pull-identiteit heeft alleen `AcrPull`; de admin-account van ACR staat uit. Nieuwe
roltoekenningen kunnen even nodig hebben om effectief te worden; controleer de provisioningstatus
en probeer een mislukte deployment zo nodig opnieuw.

De template laat `appLogsConfiguration` weg om logopslag uit te schakelen en maakt geen
Log Analytics-workspace aan. De tekst `'none'` als bestemming wordt door de Azure-API geweigerd,
ook als Bicep die accepteert. Voor onderzoek zijn consolelogs live beschikbaar via
`az containerapp logs show --resource-group $groep --name $app --follow`.
Voor langdurige opslag kun je logging toevoegen; begrens dan ingestie en bewaartermijn.

### Spelavond starten en stoppen

De eerste deployment start de app. Controleer voor het spelen de replica en het HTTPS-adres:

```powershell
az containerapp show --resource-group $groep --name $app --query properties.configuration.ingress.fqdn -o tsv
$revisie = az containerapp show --resource-group $groep --name $app --query properties.latestReadyRevisionName -o tsv
az containerapp replica list --resource-group $groep --name $app --revision $revisie -o table
```

Na de spelavond verwijder je **alleen de Container App** om zeker te zijn dat geen gameserver
blijft draaien of door een bezoeker opnieuw ontwaakt:

```powershell
az containerapp delete --resource-group $groep --name $app --yes
az containerapp list --resource-group $groep --query "[].name" -o tsv
```

Controleer dat de app niet meer in de lijst staat. Register, omgeving en pull-identiteit blijven
bestaan. Start de volgende spelavond met dezelfde `main.bicep`-deployment uit het vorige blok;
de image hoeft niet opnieuw gebouwd te worden. De beveiligde parameters worden opnieuw gevraagd.
Gebruik dezelfde appnaam en omgeving om hetzelfde adres terug te krijgen.
Alleen `minReplicas=0` instellen is geen uitschakelaar: HTTP-verkeer kan de app weer starten.

### Kosten en validatie

Bij 0,5 vCPU / 1 GiB komt **100 draaiuren** overeen met de maandelijkse gratis Consumption-grant
van 180.000 vCPU-seconden en 360.000 GiB-seconden. Die grant geldt **per abonnement**, wordt met
andere apps gedeeld, en is geen garantie op een gratis totaalbedrag. Ook opstarten, testen,
updates en wachten voor/na het spelen tellen mee.

**ACR Basic blijft geld kosten terwijl het spel uitstaat**; ook imagebuilds, uitgaand verkeer en
eventuele logs kunnen kosten geven. Er is geen vaste abonnementsprijs voor deze hele opzet.
Controleer de actuele regioprijzen en maak in Azure Cost Management een budget met waarschuwing
voor deze resourcegroep. Een budgetwaarschuwing stopt resources niet automatisch.
Gebruik indien beschikbaar een geschikt bestaand register om een extra vast registerbedrag te
vermijden; deze templates verwachten ACR in dezelfde resourcegroep.

Bronnen: [ingress en WebSockets](https://learn.microsoft.com/azure/container-apps/ingress-overview),
[Consumption-facturering](https://learn.microsoft.com/azure/container-apps/billing),
[actuele prijzen](https://azure.microsoft.com/pricing/details/container-apps/).

`npm run test:auth` controleert de toegangspoort en vier aangemelde bots op de echte server.
`npm test` voert deze tests en daarna de bestaande speltests uit. De bestaande bots gebruiken
expliciet een lokale testomgeving; productietoegang wordt apart met cookies en Origin getest.
De automatisering heeft afzonderlijke tests, zonder cloudresources. Deze vereisen PowerShell 7
en Azure CLI met Bicep: ze compileren de echte template en controleren dat logopslag en een
Log Analytics-workspace ontbreken. De deploymentaanroepen gebruiken een nagebootste Azure CLI:

```powershell
pwsh -NoProfile -File .\tests\deploy-azure.ps1
```

De Azure-templates kunnen zonder deployment worden gecontroleerd met:

```powershell
az bicep build --file .\infra\registry.bicep --stdout | Out-Null
az bicep build --file .\infra\main.bicep --stdout | Out-Null
docker build --tag blitzkrieg:controle .
```

Als Docker het standaardregister niet kan bereiken, maar Windows een vertrouwde npm-spiegel
gebruikt, geef dan de register-URL mee (zonder gebruikersnaam, wachtwoord of token):

```powershell
$npmRegister = npm config get registry
docker build --tag blitzkrieg:controle --build-arg "NPM_CONFIG_REGISTRY=$npmRegister" .
```

De containerbuild vereist een draaiende Docker-engine. Compileren en lokale tests bewijzen niet
dat cloudrollen, WSS-ingress, lange sessies of de gekozen Azure-capaciteit al in Azure zijn getest.

## Besturing

Besturing: pijltjes/WASD = rijden, spatie = schieten, K = zelfvernietiging. Terug in je eigen basis
tank, repareer en herlaad je.

Op een tablet of telefoon (iPad, Android) speel je liggend met je duimen; de knoppen verschijnen bij
de eerste aanraking. Linkerhelft van het veld = zwevende joystick (duim neerzetten en slepen, 8
richtingen), rechterhelft = vuren, het K-rondje bovenin 1 s vasthouden = zelfvernietiging. Staand
krijg je "draai je scherm". Op een telefoon (liggend, lager dan 500 px) is het zijpaneel een kleine
HUD rechtsboven: je tankkaart en de minikaart, zonder legenda. Volledig scherm: de knop ⛶ VOLLEDIG
SCHERM helemaal rechtsboven in de balk (Android zet het scherm dan ook liggend vast), of "Zet op
beginscherm" / "Toevoegen aan startscherm" in de browser: dan opent het spel zonder browserbalken. `/retro` heeft geen
touchbesturing.

Rechts staat op elke map hetzelfde: je tank (plaatje, naam, land, zeges en meters), de minikaart (terrein, je eigen basis,
je eigen tank en waar je brandstof (B) of munitie (M) haalt; geen tunnels, andere bases of tanks) en
de legenda van de map. Ook op de kaart zelf staat boven elke volle laadplek (depot, dropping) een
B- of M-badge met een pulserende ring.

## Een spel
- Wie als eerste binnenkomt is de **host**. In de wachtkamer staan bij de host naast de titel de
  **map** (10 maps, chronologisch; maps die nog niet bestaan staan grijs), de **kaartgrootte**
  (klein = 2 spelers, middel, groot, extra groot) en **START**. De anderen zien alleen de titel, die
  meeloopt met wat de host kiest. Na de start ziet ook de host alleen de titel.
- **STOP** (naast volledig scherm, alleen tijdens een spel): drukt de host erop, dan gaat iedereen
  terug naar de wachtkamer en kan de host een andere map of grootte kiezen. Drukt een gast erop, dan
  verlaat die het spel (de rest speelt door) en wordt de knop "opnieuw meedoen". Gaat de host weg,
  dan wordt de volgende speler host.
- Een **ronde** eindigt zodra er een tank dood is; daarna begint iedereen weer in zijn eigen basis
  met alles vol. Bij **2 spelers** wint wie eerst **3 rondes** wint, bij meer spelers wie eerst
  **5 kills** heeft. Een dood door een gevaar telt voor niemand. Daarna terug naar de wachtkamer.
- De kaart blijft het hele spel dezelfde; tunnels en sporen blijven tussen rondes liggen.

## Wat er in het spel zit
- **Terrein**: verhard, hard, normaal, zacht, moeras, doorwaadbare plek, ijs. Hoe zachter, hoe trager
  en hoe duidelijker je tunnel; sporen vervagen per klasse. Rots en water zijn onbegaanbaar.
- **Begroeiing en gebouwen** zijn weg te schieten (begroeiing 1–3 treffers, gebouwen 4, daarna puin).
  Een kogel raakt begroeiing over de hele breedte van je tank, en een plant die omgaat neemt alles
  binnen 4 cellen mee: zo schiet je altijd een doorgang waar je tank door past.
- **Kogels** vliegen over grond en water en stoppen bij een tank, begroeiing, gebouw, rots of geschut.
- **Zicht**: binnen je zichtcirkel (de halve hoogte van het beeld) zie je rondom: tegenstanders en
  hun kogels scherp. Gebouwen, begroeiing, rotsen en rook verbergen overal wat erachter ligt. In je
  kijkboog (130° in je rijrichting) kijk je er net langs: je ziet de rand van het obstakel en een
  tank die half achter een hoek staat. Naast en achter je zie je het obstakel zelf niet, en ook
  niets erlangs. Buiten de cirkel wordt het beeld steeds vager. Daar zie je alleen in je kijkboog
  nog iets: een tank die daar rijdt, zie je gewoon (geen vage contour meer). Waar je niets kunt
  zien, is het beeld donkerder en zie je geen tunnels, sporen, kraters of ijsbarsten, alleen het
  kale terrein. Met de knop **ZICHT AAN/UIT** in de bovenste balk zet je de mist, schaduw en
  vervaging uit; wat je niet kunt zien, blijft verborgen.
- **Richtingshints**: een gloed aan de rand in één van 8 richtingen bij een schot, een omgeschoten
  plant of krakend ijs van een tegenstander binnen 20 T, en bij grote gebeurtenissen overal. Zie je
  die tegenstander scherp, dan komt er geen hint.
- **Weer** per map, per ronde of op een timer: zichtstraal, stormen die sporen wissen (stilstaan =
  onderduiken), mist, regen, nacht met zoeklichten, en terrein dat verandert (dooi, modder, inundatie).
  Verstuiving: sneeuwval (Ardennen, Leningrad tot de dooi) en woestijnwind (El Alamein) wisselen van
  licht tot zwaar en laten tunnels dichtlopen. Bij een beetje sneeuw of zand is een vers spoor na 2
  minuten dicht, bij zware sneeuw of wind na 45 s, en een storm (20 s) maakt het voor 90% dicht.
  Sneeuw doet dat op elke grond even snel; zand vooral in los zand (rotsige grond en de kustweg half
  zo snel). Regen is alleen beeld (druppels, spatten, regengordijnen, donkerder lucht) en verandert
  niets aan tunnels, behalve de bestaande regenbui bij Carentan die bij het water sporen wist. In
  Carentan en Berlijn komen regenstormen met onweer: bliksem die voor iedereen tegelijk flitst.
- **Gevaren en schaarse middelen** per map: zie de tabel hieronder.

| Map | Gevaar | Schaars middel | Weer |
|---|---|---|---|
| 1940 Grebbeberg | – | munitie alleen bij het depot in Rhenen | inundatie vanaf ronde 2, regen in ronde 3, rook |
| 1941 Russische vlakte | – | dubbel brandstof in de modder | zomer met stofspoor; vanaf ronde 3 modder |
| 1942 El Alamein | zandmeter, mijnen | – | hitte met valse contouren; wisselende woestijnwind; zandstorm elke 90 s |
| 1942 Leningrad | breekbaar ijs | motorwarmte | schemering, wisselende sneeuwval, sneeuwjacht; dooi in ronde 4 |
| 1943 Koersk | brandend graan | motortemperatuur | zomer met rook; onweer met regen vanaf ronde 3 |
| 1944 Carentan | verborgen antitankgeschut | – | ochtendmist; regenstorm met onweer elke 120 s (wist sporen bij het water) |
| 1944 Arnhem | de brug kan ontploffen (10% per oversteek, +5% na elke oversteek) | brandstof en munitie via droppings | helder; mist en regen vanaf ronde 3 |
| 1944 Ardennen | barrage in het bos | brandstofdepots | mist, wisselende sneeuwval; sneeuwstorm elke 90 s |
| 1945 Oder-front | artilleriebarrage | – | nacht met zoeklichten; dageraad vanaf ronde 3 |
| 1945 Berlijn | instortende gevels | pantser wordt niet hersteld | rook, steeds dichter; ronde 3 regen met onweersbuien |

**Alle getallen staan in `shared/config.js`**: terreinklassen, maten (T = 5 cellen), zicht, tank,
kogels, mijnen, gebouwen, rondes, hints, netwerk, rook en kaartgroottes. Zie de uitleg bovenaan elk
blok. **Elke kaart (veldslag) staat in een eigen bestand** in `shared/maps/` (`carentan.js`, ...):
het terrein in procenten, de vaste kenmerken (dorpen, rivieren, wegen, ...), het weer, het gevaar,
het schaarse middel en de meter met hun getallen, de kleuren en het uiterlijk van de tanks. De
velden staan uitgelegd bovenaan `shared/maps/index.js`, waar ook het mapmenu staat.

### Afwijkingen van de spec (bewust)
- **Zicht** (§9): in plaats van een vaste zichtstraal van 12 T is de zichtcirkel de halve hoogte van
  het beeld. Het weer houdt zijn waarden in T: 12 T = de volle cirkel, 6 T = de helft, nooit kleiner
  dan 2 tankbreedtes (`VISION`). Rotsen blokkeren het zicht ook. In een kijkboog van 130° in je
  rijrichting kijk je langs de randen van obstakels, naast en achter je niet. Buiten de cirkel zie
  je geen schim maar, alleen in de kijkboog, de tank zelf (de vage contour is geschrapt; alleen de
  valse contouren bij El Alamein bestaan nog, zie `docs/open-punten.md`). Kogels van anderen zie je alleen scherp in je zichtveld. Tunnels en sporen zie je
  alleen waar je zicht hebt (de spec laat ze overal zien). Een tegenstander die je scherp ziet,
  geeft geen richtingshint.
- **Percentages en vaste breedtes**: wegen (2 T) schalen niet mee; op een kleine kaart is verhard
  daardoor meer dan 8% (bv. Ardennen ~13%), en dat gaat van de andere klassen af. De test houdt daar
  rekening mee; Ardennen klein heeft daarvoor 1 procentpunt extra marge (`tolerance`).
- **Berlijn met 4 spelers**: de vrije zones rond de bases (~13% van de stad) mogen geen huizen hebben,
  dus ~25% gebouwen in plaats van 30% (ruimere marge in de config). De Spree en het kanaal zijn iets
  smaller (2 en 1,5 T), anders is het water ~12% in plaats van 7%. Er is **geen metro** (op verzoek).
  Op de kleine kaart passen de bases niet tussen de rivieren: ~20% gebouwen (marge 13 in plaats van 8).
- **Krappe kaarten** (Market Garden en Berlijn klein): passen de bases niet volgens alle regels, dan
  wordt eerst de vensterregel versoepeld, daarna de afstand tot de rivier (die buigt dan om de basis
  heen) en pas als laatste de uitrijstrook (tot de 3 T uit de spec).
- **Brug bij Arnhem**: in de spec ontploft de brug altijd na de eerste oversteek. Hier is het een
  kans: 10%, en elke oversteek 5% meer (`chance`/`chanceStep`). De teller loopt door over de rondes
  (de brug zelf is elke ronde weer heel) en begint pas bij een nieuw spel weer bij 10%.
- **Huizen en kerken** staan nooit op een weg of dijk, en in een dorp ook niet pal ertegen.
- **Plassen en rotsen** worden niet afgekapt door de rechthoekige zones (rond de bases, het dorp, een
  park, een gebied): komt een blob daaraan, dan wordt hij kleiner of komt hij ergens anders.
- **Dorpshuizen** tellen niet mee in de percentages; ze gaan van de andere klassen af (ruimere marge).
- **Maten van gebouwen**: de kaartmaker gebruikt vaste grondvlakken (`BUILDINGS` in config.js), ongeveer
  1,7 keer de getekende gebouwen, zodat een huis groter is dan een tank (~6,6 × 5,2): kerk 14×26
  (spec: 2T×3T; in een krap dorp dwars), boerderij 19×17, dorpshuizen 60% woonhuis 10×10 en 40%
  rijhuis 20×8 (de helft gedraaid) in plaats van een willekeurige maat van T tot 2T. Een dorp kan per
  kaartgrootte een eigen maat hebben (`size: { klein, middel }`): Arnhem is op klein naar verhouding
  groter, anders passen de huizen niet.
- **Rand van de kaart**: geen rotsrand meer. Langs de rand ligt een onbegaanbare strook van 2
  tankbreedtes (`EDGE.band`, 11 cellen) waarin het terrein doorloopt (het spiegelbeeld van het terrein
  ernaast) en naar buiten toe zwart wordt. Tanks, kogels, gebouwen, bases en gevaren blijven erbuiten
  (`playable` in world.js); de percentages gelden voor het speelbare deel. De retrokaart houdt zijn
  rotsrand. Een kogel stopt dus aan de binnenrand van de strook, niet aan de kaartrand (spec §5.8).
- **Bedekte tank** (spec §5.7): je eigen tank blijft onder een hoop sneeuw, zand of stof te zien
  (verbleekt, de loop steekt eruit, `BURIAL` in config.js); de hoop valt eraf als je rijdt of schiet.
- **Koersk**: de Psel (3 T) is maar ~3% water; de rest van de 6% zijn plassen. Er zijn **geen
  loopgraven** (op verzoek): verhard is één zandweg met de brug over de Psel, aangevuld met
  zijwegen vanaf de rand, samen nog steeds ~6%.
- **Leningrad**: bevroren veen is lichter dan in de spec (#8a7e72), anders zijn tunnels niet te zien.
- **Oder-front**: de helling heeft 1 eigen opening; de twee wegen erdoorheen zijn de andere twee.
- **Bossen** liggen minstens 2 cellen uit elkaar (losse bossen); breedte 1–5 T zoals in de spec.
- Gevaren en weer worden in de browser van elke speler verborgen of getoond (geen anti-cheat).

## Testen
```
npm test            # alle tests (testserver met vaste kaart, snelle weerklok, 2 rondes om te winnen;
                    # tests zonder server lopen tegelijk in worker-threads, ~1,5 minuut)
npm test -- ijs     # alleen tests met 'ijs' in de naam
npm run test:auth   # alleen toegangspoort en aangemelde multiplayer
npm run test:gen    # de grote generatietest: elke map 100 keer, 4 groottes, 2/3/4 spelers
npm run test:gen -- ardennen 10   # één map, 10 kaarten per geval
```
Elk acceptatiecriterium uit §12 heeft tests (zie `tests/acceptance.mjs`). Ontwikkelen (alleen op
localhost, in de adresbalk):
- `?debug=alles` toont alle tanks en zet het zicht uit;
- `?zoom=3` zet de camera dichter op je tank (om details te bekijken);
- `?fps=1` toont linksboven de beelden per seconde en de rekentijd per beeld;
- `?kijk=0.5,0.45` zet de camera op die plek van de kaart (fractie van breedte en hoogte) in plaats
  van op je tank, om water, ijs of bruggen te bekijken zonder erheen te rijden (in de console:
  `blitzView.lookAt(0.5, 0.45)`, en `blitzView.lookAt()` terug naar je tank);
- `blitzView.bench()` in de console tekent 120 beelden direct na elkaar en geeft de tijd per beeld,
  ook als het venster niet zichtbaar is (het kan niet sneller meten dan de verversing van het scherm);
- `blitzView.assets()` in de console zegt welke texturen en sprites uit `public/assets/` komen;
  `blitzView.play('explosie', x, y, { size: 14 })` speelt een effect af om het te bekijken.

## Uiterlijk per map (`look`)
Alle maps gebruiken dezelfde weergave (PixiJS); alleen de instellingen verschillen. Die staan in
`shared/config.js` (`LOOK`, de standaard) en in het bestand van de kaart in `shared/maps/`, dat met
`look: { ... }` velden kan overschrijven.
De spelregels kijken er niet naar.

| Veld | Wat |
|---|---|
| `grade` | Kleurfilter over de wereld: `saturation` (-1 grijs .. 1 feller), `brightness`, `contrast` (1 = gelijk), `tint` (`#rrggbb`) met `tintStrength` (0..1). |
| `noise` | Grondtextuur met simplex-ruis: `scale` (cellen per vlek), `strength`, `octaves`. Werkt vooral op donkere grond. |
| `blend` | Breedte van de zachte overgang tussen terreinklassen, in cellen. |
| `ground` | Grondtexturen: `cells` (zoveel cellen beslaat één textuur van 512 px), `tint` (0 = eigen kleur van de textuur, 1 = klassekleur van de kaart), `contrast` (0 = effen, 1 = zoals getekend), `textures` (`{ klasse: naam }`: een andere textuur dan het manifest zegt). |
| `light` | Eén lichtbron voor alle schaduwen: verschuiving `dx`, `dy` (cellen), `alpha`, `blur` (zachte rand). |
| `weather`, `amount` | Deeltjes in beeld: `'snow'` (ronde vlokken, `SNOW_FX`), `'sand'` (stuifzand en zandwolken, `SAND_FX`), `'dust'` (stofjes) of `null`, en hoeveel per 100×100 cellen. Sneeuw en zand volgen de sterkte van de verstuiving; regen komt uit de weerregel `rain` (`RAIN_FX`). Getekend in `public/view/weather-view.js`. |
| `vignette`, `fogSoft` | Donkere hoeken; hoe zacht de rand van je zichtveld inloopt. |
| `water` | Water in de grondshader: `deep` (donkerte in het diepe), `depthCells` (zo ver van de kant is het diep), `shore` (lichter aan de kant), `shine` (glinstering), golven met `waveCells` (maat), `waveSpeed` en `waves` (sterkte). Ook de glans op moeras en doorwaadbare plekken. Grillige waterlijn (ook ijs, alleen weergave): `edgeNoise` (zoveel cellen schuift de lijn hoogstens), `edgeScale` (maat van de inhammen), `edgeFine` (aandeel rafelige ruis). |
| `ice` | IJs: `depthCells` en `deep` (donker, diep ijs naar het midden), `frost` (witte ijzel), `sheen` (glans), `stress` (donkerder, nat ijs in een vak dat bijna breekt), `crackWidth` en `crackGrow` (barsten dikker per stadium). Met een ijstextuur in het manifest (`ice` per stijl of kaart): `texScale` (maat t.o.v. de grondtextuur) en `texDeep` (donkerder naar het midden). |
| `road` | Wegen (de middellijnen uit de kaartmaker): `verge`, `vergeColor` (`null` = modder in de tunnelkleur), `vergeAmount` en `vergeInside` (berm; hij begint al op de rijbaan, zodat er geen lijn langs de weg komt), `edgeNoise` (rafelige rand), rijsporen met `ruts`, `rutOffset` en `rutWidth`, `smooth` (afronding van binnenhoeken), `junction` (zo ver van een kruising krijgt de weg weer een richting), `curb` en `curbColor` (stoeprand, ook langs het stadsrooster), `line` (middenstreep). De textuur van de klasse van de weg loopt mee met de bocht. |
| `objects` | Bomen en rotsen als sprites: `rocks` (op zo'n deel van de rots staat een rotsblok), `rockGround` (de rotsblokken liggen op de gewone grond, zonder grijze rotsplaat; standaard aan, Berlijn uit voor de betonnen bunkers) en `rockShade` (zoveel donkerder is de grond midden in een rotsveld). Welke soorten een kaart heeft staat bij `vegetation` in het kaartbestand: `sprites` (`{ struik: 0.65, cactus: 0.35 }`, anders de soort bij `type`) en `palmCoast` (tot zo ver van zee wordt begroeiing een palm). Maten en schaduw in `OBJECTS` (config.js): een boomkruin is 7–10 cellen, groter dan een tank; aan de rand van een bos of rotsveld worden ze kleiner, zodat een kruin hoogstens `overhang` cel over open grond hangt (hij staat boven de tanks). |
| tanks | Niet in `look`, maar bij `tanks` in het kaartbestand: welke tank elke ploeg rijdt, bijv. `{ A: 'comet', B: 'panther' }`. De vijf tanks (Landsverk, T-34, Panther, Sherman, Comet) met naam, land en minikaartkleur staan in `TANKS` in config.js, op elke map met hetzelfde uiterlijk. Tekening: `public/assets/tanks/<naam>/` (romp, rupsstrook, `tank.json`; zie `docs/SPEC-tanks.md`); de rupsen schuiven mee met het rijden. Hoe donker ploeg C/D is: `TANK_ART`. Zonder bestand tekent de stijl de tank. |
| `waterPlants` | Waterplanten: `density` (kans per roosterpunt, 0 = uit), `width` (zo ver van de waterlijn een waterlelie of ijsblad), `reach`, `offset` en `clump` (oeverplanten staan in groepjes tegen de getekende waterlijn). |
| `grain` | Korrel over het beeld (0..1); samen met `grade` en `vignette` in één nabewerkingsfilter. |
| `bridge` | Bruggen als sprite: `kind` (`hout` of `staal`: welke tekening uit `public/assets/<stijl>/bridges/`, anders getekend), `land` (zo'n deel van het landhoofd ligt op de oever), `height` (lengte van de schaduw). |
| `iceShine`, `haze`, `shakeOnHit` | Glinstering op ijs, hittewaas (als het weer `heatHaze` heeft), schudden als je geraakt wordt. |

**Een nieuwe map een eigen stijl geven:**
1. Kies in het bestand van de kaart de weergave met `style` (`zomer`, `winter` of `woestijn`). Die
   bepaalt de vormen (bomen, bases, tanks, de textuur over de kaartkleuren) en de opmaak van het
   zijpaneel.
2. Geef de kleuren van het terrein in `classes`, `rocks`, `water`, `vegetation` en `tunnelColor`.
3. Voeg een `look`-blok toe, bijvoorbeeld koud en besneeuwd:
   `look: { grade: { saturation: -0.15, tint: '#d2e2ff', tintStrength: 0.18 }, weather: 'snow', amount: 30 }`.
4. Herstart de server en bekijk de map met `?zoom=2` en `?fps=1`.

Een heel ander soort vormen (bijvoorbeeld een stad in de sneeuw) betekent een nieuwe stijl in
`public/styles/`: een tekenmodule `<naam>.js` (`surface` voor de grondshader, `drawTank`, `drawBase`,
getekende objecten als er geen atlas is; zie de uitleg bovenaan `public/world-view.js`), een map
`public/assets/<naam>/` met texturen en sprites (zie `public/assets/LEESMIJ.md`) en een thema `<naam>.css` (kleuren en randen van het speelveld
en het zijpaneel, op `[data-style="<naam>"]`), plus een `<link>` naar dat thema in `index.html`.

## Opbouw
| Bestand | Wat |
|---|---|
| `shared/config.js` | Alle algemene getallen (terrein, zicht, tank, kogels, netwerk, ...). |
| `shared/maps/` | De kaarten: één bestand per veldslag, `index.js` met het mapmenu en de uitleg van de velden. |
| `shared/game.js` | De ingang voor de spelregels (`import * as G`): geeft alles door uit de bestanden hieronder, plus rondes en score. Server én browser. |
| `shared/world.js` | Kaartmaat, celtypes, terreinklassen, de tankvorm en deterministisch toeval. |
| `shared/terrain.js` | Wat de kaart verandert: graven, sporen en vervagen, wegschieten, ijs en dooi, weer en gevaren. |
| `shared/movement.js` | Rijden, kogels en mijnen. |
| `shared/codec.js` | De kaart over de lijn: run-length encoding en base64. |
| `shared/mapgen.js` | Kaartmaker (§6): bases eerst, dan kenmerken, terrein tot de percentages, controle; ook de retrokaart. |
| `shared/weather.js` | Weerregels per ronde en timer. |
| `shared/vision.js` | Zichtregel (kijkboog, zichtlijn, scherp of contour), richtingshints, zoeklichten. |
| `shared/client-sim.js` | Clientkant zonder browsercode: berichten (tabel `ON` met alle gebeurtenissen), voorspelling, posities. Browser én tests. |
| `hazards.js` | Gevaren, schaarse middelen en meters (alleen server; die gooit de dobbelsteen). |
| `server.js` | Autoritatieve simulatie op 30 ticks/s, wachtkamer en rondes. |
| `public/index.html`, `shell.js` | De spelpagina: titel, menu's, speelveld en zijpaneel. `shell.js` laadt de stijl van de kaart en wisselt hem bij een andere kaart. |
| `public/world-view.js` | Gedeelde wereldweergave (PixiJS): lagen, kaart, zicht, hints, objecten, tanks, weer, `look`. |
| `public/view/tanks-view.js` | Tanks als container: twee rupsen (`TilingSprite`, schuiven mee met rijden en draaien) en de romp erboven, schaduw met `tank.png`; anders `tank.png` of de getekende tank. |
| `tools/maak-tanks.mjs` | Knipt de tanksprites uit de vellen in `input/tanks/` (tank, romp, rupsstrook) en meet `tank.json`: `node tools/maak-tanks.mjs`. |
| `tools/deploy-azure.ps1` | Automatiseert registry, imagebouw/publicatie en Azure-deployment; ondersteunt verborgen invoer, `-ConfigFile` en `-WhatIf`. |
| `infra/deploy-input.example.json` | Voorbeeld zonder geheimwaarden; kopieer dit buiten de repo en vul daar de Azure-instellingen en geheimen in. |
| `tests/deploy-azure.ps1` | Controleert de gecompileerde Bicep-template en deploymentautomatisering zonder cloudresources. |
| `public/view/` | Delen van de weergave: `side-panel.js` (minikaart, legenda, tankkaart) en `hazards-view.js` (gevaren en laadplekken in beeld: depots, kratten met parachute en het munitiedepot als sprite uit de atlas, anders getekend). |
| `public/view/ground-gpu.js` | De grond op de videokaart: één mesh met een eigen shader (terreinklassen met texturen, tunnels, rots, water, ijs, puin, schone kaart buiten je zicht). |
| `public/view/bridges-view.js` | Bruggen als sprite (begin, herhaald middenstuk, eind) in de richting van de weg, met schaduw; het wrak als de brug bij Arnhem ontploft. |
| `public/view/base-kit.js` | De basis als bouwpakket: muurstukken, hoekpalen, deurposten en spullen uit `public/assets/<stijl>/bases/` op de echte cellen van de basis (maten in `BASE_KIT`). |
| `public/view/buildings-view.js` | Gebouwen in drie stadia (heel, half, puin) als sprite, als hun grondvlak past bij een getekend gebouw (`BUILDINGS` in config.js); anders het dak uit de grondshader. |
| `public/view/plants-view.js` | Waterplanten langs de oever (zomer: waterlelies en oeverplanten, winter: ijsbladeren en riet); alleen decoratie. |
| `public/view/effects-view.js` | Flipbook-effecten (explosie, rook, mondingsvuur, inslagen) uit `public/assets/effects/` en lichtvlekjes bij schoten en explosies. |
| `public/view/roads.js` | Wegenveld voor de shader: de middellijnen gladgemaakt (Chaikin) en per cel de afstand tot de dichtstbijzijnde en de op één na dichtstbijzijnde weg en de plek langs de weg. |
| `public/assets.js`, `public/assets/` | Asset-loader en de sprites en texturen zelf (`manifest.json` zegt wat er is, `LEESMIJ.md` wat wat is). Wat ontbreekt, wordt procedureel of zoals vroeger getekend. |
| `public/pixi-scene.js` | Pixi-hulpjes: vaste texturen, tegelsprites, deeltjes, labels. |
| `public/view/objects-view.js` | Bomen, struiken, heggen, cactussen, palmen, rotsblokken en kraters als sprites uit de atlas van de stijl, per tegel en alleen in beeld; omgeschoten begroeiing als kapotte variant (of weg). |
| `public/render-common.js` | Hulpjes (kleur, ruis, velden), tegelcanvassen voor de getekende objecten als er geen atlas is, camera, gedeelde tekeningen. |
| `public/styles/` | De stijlen: `zomer.js`, `winter.js`, `woestijn.js` (tekenen) met hun thema `.css`, en `view.css` (opbouw van speelveld en zijpaneel). |
| `public/touch.js`, `touch.css` | Touchbesturing (joystick, vuren, K) en de telefoonstand van het speelveld. |
| `public/manifest.webmanifest`, `icon.svg` | Op het beginscherm zetten: volledig scherm, liggend. |
| `public/retro.html`, `client.js` | Het originele Tunneler. |
| `tests/` | `run.mjs`, `tests.mjs`, `maps.mjs`, `acceptance.mjs`, `gen.mjs`, `gen-checks.mjs`, `fingerprint.mjs` (zelfde seed = zelfde kaart), `helpers.mjs`. |

Interne namen die zijn blijven staan: de map-id's, de omgevingsvariabelen `TUNNELER_*` en de
potnaam van retro.

## Waarom het snel en soepel is
- De kaart gaat **één keer** over de lijn: kaart, terrein, sporen, planten en gaten als binaire RLE,
  gecomprimeerd (permessage-deflate; ~27 KB na drie minuten spelen met vier tanks).
  Daarna rekent elke client zelf mee: deterministisch, dus identiek aan de server. Per tick gaan
  alleen gewijzigde tankvelden mee (delta's), ongecomprimeerd.
- **Eigen tank voorspeld**: hij rijdt meteen als je een toets indrukt, met dezelfde regels als de server.
  De server bevestigt per tick hoe ver hij is; afwijkingen worden in ~0,1 s weggewerkt.
- **Buffer tegen haperingen**: andere tanks en kogels worden ~1 tick achter de servertijd getekend,
  op basis van een geschatte serverklok, zodat ze niet springen als berichten in groepjes aankomen.
- **PixiJS (WebGL)**: de weergave tekent in lagen (grond, markeringen, schaduwen, objecten, tanks,
  kruinen, effecten, mist, UI). Wat duur is (kaart, bomen, bases, tanks) wordt één keer getekend en
  daarna alleen verplaatst of gedraaid; ~4 ms per beeld op 1560×1012. De pakketten (`pixi.js`,
  `pixi-filters`, `simplex-noise`) komen via `npm install` en de server geeft ze op `/vendor/`; een
  import map in `index.html` koppelt de namen. Geen build-stap, en het werkt zonder internet.
- **Grond op de videokaart**: de kaart gaat als een paar texturen van 1 pixel per cel naar de
  videokaart (celtype, klasse, sporen, randvelden); een shader rekent per schermpixel uit wat er ligt,
  dus scherp op elke zoomstand. Bij graven worden alleen de veranderde cellen geüpload. Instappen
  kost ~0,2 s in plaats van ~1,5 s (de oude schilder moest eerst alle tegels in beeld schilderen).
- **Objecten als sprites**: bomen en rotsen komen uit één atlas per stijl en staan per tegel van 32×32
  cellen in een container; alleen tegels in beeld worden getekend. Een omgeschoten plant bouwt alleen
  de tegels eromheen opnieuw op.
- **Robuust**: berichten max. 4 KB, max. 60 berichten/s per speler, hartslag elke 5 s ruimt
  verbindingen van slapende laptops op, en een fout in één verbinding laat de server niet crashen.
