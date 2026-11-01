# Filament Profiler

Erzeugt Filamentprofile für **OrcaSlicer, Snapmaker Orca, Bambu Studio, PrusaSlicer/SuperSlicer und Cura** aus Hersteller- und Slicer-Daten. Jeder Wert zeigt, woher er stammt (Quelle, Datei/Datenblatt, Abrufzeit).

## Starten
Doppelklick auf **`Filament Profiler starten.bat`** (benötigt Node.js). Es öffnet sich ein eigenes App-Fenster (Edge/Chrome); der Server läuft minimiert im Hintergrund (nur `127.0.0.1:47811`) und beendet sich, wenn das Fenster geschlossen wird.

## Ablauf
1. Hersteller wählen → 2. Material/Produkt → 3. Drucker + Düse (aktive Drucker aus deinen installierten Slicern erscheinen als Schnellauswahl).
4. Werte prüfen/ändern, Ziel-Slicer wählen, **Profil speichern** oder **In … installieren** (schreibt in den Benutzer-Profilordner; danach den Slicer neu starten).

Farbpunkte: grün = offizielles Profil für genau diesen Drucker · blau = Herstellerdatenblatt · türkis = Herstellerprofil (anderer Drucker) · gelb = Druckerstandard für dieses Material · lila = Community-Datenbank · grau = Slicer-Grundwert · orange = Standardwert ohne Herstellerdaten (bitte prüfen).
Klick auf den Punkt zeigt Quelle, Link, Abrufzeit und alternative Werte anderer Quellen („übernehmen“).

## Datenquellen (nur strukturierte, öffentliche Daten; robots.txt wird geprüft)
- OrcaSlicer-Profilrepo (neuestes Release; enthält Bambu-Lab-Profile und die Orca Filament Library)
- Snapmaker-Orca-Repo (Snapmakers eigene Profile; haben für Snapmaker-Drucker Vorrang)
- PrusaSlicer-Konfigurationsbündel (Prusa + Fremdhersteller)
- Ultimaker fdm_materials (Cura)
- Open Filament Database (Herstellerangaben aus Datenblättern, Links zu TDS/SDS)
- SpoolmanDB (Dichte, Spulen-/Leergewichte)
- Slicer-Quellcode (PrintConfig.cpp bzw. Cura-Materialzuordnung) als Schema: Exporte enthalten nur Schlüssel, die deine **installierte** Slicer-Version kennt.

Beim Start wird automatisch nach neuen Daten gesucht (abschaltbar unter „Quellen“). „Daten aktualisieren“ lädt manuell; Updates sind inkrementell. Cache: Ordner `data\`.

## Import von Hand
- OrcaSlicer / Snapmaker Orca / Bambu Studio: Datei → Importieren → Konfigurationen importieren (die `.json`).
- PrusaSlicer: Datei → Importieren → Konfigurationspaket importieren (die `(Bundle).ini`) oder die `.ini` nach `%APPDATA%\PrusaSlicer\filament` kopieren.
- Cura: Einstellungen → Konfigurieren → Materialien → Importieren (`.xml.fdm_material`). Cura kennt kein Pressure Advance / keine max. Fließrate – diese Werte stehen nur in der Beschreibung.

## Website (GitHub Pages)
Dieselbe Oberfläche läuft auch als statische Website – die gesamte Logik läuft im Browser.
- `web/build-data.js` lädt alle Quellen (inkrementell, Cache in `data/`) und die Einstellungs-Schemas der letzten 4 Releases jedes Slicers.
- `web/build-site.js` bündelt `lib/` für den Browser (`engine.js`), kopiert `public/` und packt die Daten nach `web/dist/`.
- `.github/workflows/pages.yml` macht beides täglich um 04:17 UTC (und bei jedem Push) und veröffentlicht `web/dist` auf GitHub Pages.
- Lokale Vorschau: `node web/build-site.js` und dann `node web/serve.js` → http://127.0.0.1:47812/

Unterschiede zur Desktop-App: kein „In Slicer installieren“ (nur Download) und die Slicer-Version wird ausgewählt statt erkannt.
Hinweis: GitHub pausiert zeitgesteuerte Workflows nach 60 Tagen ohne Aktivität im Repository. Dann im Reiter „Actions“ wieder aktivieren.

## Hinweise
- Retraktion wird standardmäßig vom Druckerprofil übernommen („nil“); per Häkchen fest ins Profil schreibbar.
- Pressure Advance ist nur aktiv, wenn eine Quelle es vorgibt – sonst erst nach eigener Kalibrierung einschalten.
- Werte sind Startwerte: Flussrate und PA für jedes Filament kalibrieren.
