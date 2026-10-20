# Flesh: Muskelfaser-Identität

Die ausgewählte Marke zeigt geschwungene organische Muskelfasern als längliches Bündel. Helle Creme- und Koralllinien stehen auf dunklem Bordeaux. Das Symbol ersetzt das frühere Herz in der Anmeldung, der Seitenleiste, im Browser und auf dem Home-Bildschirm.

## Farbpalette

| Verwendung | Farbe |
| --- | --- |
| Primäre Buttons, aktive Navigation, Browser-Theme | Bordeaux `#601e30` |
| Primäre Button-Hoverfarbe | Dunkle Koralle `#7c2d42` |
| Akzente im Logo | Koralle `#db8f83`, Blush `#f0b9a5`, Creme `#fff5e9` |
| Seitenhintergrund | Warmes Creme `#fbf5ef` |
| Primärer Text | Dunkles Pflaumenbraun `#422b32` |
| Sekundärer Text | Gedämpftes Pflaumenbraun `#79636a` |
| Karten | Creme, zartes Korallrosa und gedecktes Rosé |

Koralle und Blush dienen als helle Akzente; Buttons behalten einen dunklen Hintergrund mit weißem Text. Formularfokus und Checkboxen verwenden die Bordeaux-Familie.

## Produktionsdateien

- `public/icon-512.png`: hochauflösendes Haupt- und maskierbares PWA-Icon.
- `public/icon-192.png`: PWA-Icon, Bildmarke in der App und Benachrichtigungsicon.
- `public/apple-touch-icon.png`: deckendes 180×180-Icon für den iPhone-Home-Bildschirm.
- `public/favicon.png`: 64×64-Browsericon.

Das Bildmaterial wurde aus dem ausgewählten KI-generierten Muskelfaser-Konzept erstellt und als PNG exportiert. Es handelt sich um Rastergrafiken, nicht um SVG-Vektoren. Der dunkelrote Hintergrund reicht bis zum Rand; das zentrale Symbol hat Abstand zu den Ecken und bleibt bei runden und abgerundeten Betriebssystemmasken erkennbar. Die originale Konzepttafel wird nicht mit der App ausgeliefert.

Manifest und Apple-Touch-Link referenzieren versionierte Icon-URLs. Der Service-Worker-Cache wurde für das neue Design erneuert und speichert weiterhin ausschließlich öffentliche App-Dateien. Gesundheitsdaten werden nicht im Icon oder Cache abgelegt.

## Aktualisierung installierter Apps

Nach dem Server-Update Flesh online öffnen, damit App-Dateien und Service Worker aktualisiert werden. Bereits installierte Home-Bildschirm-Icons werden vom Betriebssystem verwaltet und können weiter das alte Symbol zeigen. Falls nötig, nur die Home-Bildschirm-Verknüpfung entfernen und Flesh erneut über Safari → Teilen → „Zum Home-Bildschirm“ hinzufügen. Den Account nicht löschen; gespeicherte Gesundheitsdaten liegen weiterhin verschlüsselt auf dem Server.

Die Integrationstests prüfen HTTP-Auslieferung, Dateiformat und tatsächliche PNG-Abmessungen. Desktop- und Mobilansicht werden mit Chromium geprüft. Ein echter iPhone-/Safari-Test und die Icon-Aktualisierung auf einem realen Gerät stehen noch aus.
