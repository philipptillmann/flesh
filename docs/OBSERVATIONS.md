# Beobachtungen

## Oberfläche

Die Navigation enthält Übersicht, Beobachtungen, Medikamente und Datenschutz. Schmerzen und Menstruation sind Arten einer Beobachtung, keine eigenen Hauptmenüs.

Im Bereich Beobachtungen:

- **Allgemein:** Bezeichnung und Datum; optional Thema, Einordnung (Neutral, Positiv, Unangenehm), Messwert, Einheit und Notizen. Ein Leiden oder ein Thema ist nicht erforderlich.
- **Schmerz:** Datum, Stärke 0–10, optionale Körperstelle, Thema und Notizen.
- **Menstruation:** Datum, Blutungsstärke, Periodenbeginn, optionale Beschwerden, Beschwerdestärke und Notizen. Ein Eintrag je Datum; bestehende Zyklusberechnungen bleiben verfügbar.

Alle drei Arten erscheinen gemeinsam nach Datum absteigend. Der Art-Filter begrenzt den Verlauf auf Allgemein, Schmerz oder Menstruation. Zyklusdaten erscheinen bei ausgewählter Menstruationsart oder entsprechendem Filter. Medikamente und bestätigte Einnahmen bleiben separat.

Themen sind optionale Zuordnungen wie Schlaf, Bewegung, Haut oder Migräne. Vorhandene Leiden werden als Themen angezeigt; ihre Namen bleiben unverändert. Die App bewertet Messwerte nicht medizinisch und berechnet keine Fruchtbarkeit.

## Bestehende verschlüsselte Daten

Es gibt keine serverseitige Datenmigration und keine Änderung an der Verschlüsselung. Nach dem Entschlüsseln ergänzt der Browser eine fehlende Liste `observations` im Arbeitsspeicher. Erst beim Speichern wird der erweiterte Tresor wieder verschlüsselt übertragen.

Bestehende Listen `conditions`, `pain`, `cycles`, `meds` und `intakes` behalten ihre Namen und Inhalte. Auch unbekannte Zusatzfelder bleiben erhalten. `conditions` wird nur in der Oberfläche als Themen bezeichnet. Neue allgemeine Einträge liegen in `observations`; neue Schmerz- und Menstruationseinträge verwenden weiterhin die bestehenden Listen. Ein zusammengeführter Verlauf wird nur für die Anzeige berechnet, nicht als zweite Kopie gespeichert.

Beim Löschen eines Eintrags wird seine ursprüngliche Liste verwendet. Gleiche IDs in verschiedenen Listen sind daher keine Grundlage für ein listenübergreifendes Löschen. Die bestehenden Daten können weiterhin verschlüsselt exportiert werden.

## Prüfung

- `tests/observations.mjs`: alte Daten und unbekannte Felder unverändert übernehmen, gemeinsamen Verlauf sortieren, nach Art filtern und Nullwerte erhalten.
- `tests/browser.py`: ein altes verschlüsseltes Journal ohne `observations` laden, bestehende Schmerz-/Menstruationseinträge anzeigen, neue allgemeine/positive Einträge speichern, Filter verwenden, Medikamente erfassen und Daten nach Sperren/Anmelden erneut entschlüsseln. Zusätzlich Mobilbreite und HTML-Escaping prüfen.
- Ein echter Safari-/iPhone-Test bleibt ausstehend.

## Web-Push

Issue #5 bleibt offen. Aktuelle Erinnerungen benötigen eine laufende, entsperrte App. Für zeitgenaue serverseitige Push-Zustellung müsste geklärt werden, ob der Server Versandzeitpunkte als zusätzliche Metadaten speichern darf. Aktuell liegen auch die Medikamentenpläne verschlüsselt vor. Push-Nachrichten sollen unabhängig davon keine Medikamentennamen oder Gesundheitsangaben enthalten. Für die Fertigstellung werden außerdem VAPID-/Abonnementverwaltung, Fehlerbehandlung und ein Test auf einer installierten iPhone-PWA benötigt.
