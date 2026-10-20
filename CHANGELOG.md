# Changelog

## Unreleased

### Implementiert

- #14: Sprüche entfernt; kurze sachliche Texte für Anmeldung, Navigation, Formulare und Datenschutz.
- #15: Menstruation, Schmerzen und allgemeine Beobachtungen in einem Bereich mit gemeinsamem Verlauf und Art-Filter zusammengeführt.
- #16: Allgemeine körperliche Beobachtungen ohne Leiden erfassbar; optionale Themen, Einordnung und Messwerte. Bestehende verschlüsselte Einträge bleiben erhalten.

- #13: `.env`-Einstellungen für Bind-Adresse und Port sowie gesperrte Zusatzregistrierungen mit einmaliger Erstkontoanlage; bestehende Accounts und Daten bleiben erhalten.

- #11: Muskelfaser-Logo in App, Browser und PWA; Apple-Touch-Icon und maskierbares Home-Screen-Icon sowie Bordeaux-, Korall- und Cremefarben für Buttons, Navigation und Formulare.

- #12: Installation und Aufruf über `~/flesh/update.sh` ohne Root-Pflicht; verständliche Vorabprüfung des Docker-Zugriffs und aktualisierte Anleitung.

- Flesh als App-Name in Oberfläche, PWA und Benachrichtigungen.
- Benutzerkonten mit clientseitig verschlüsseltem Tresor und getrenntem Authentifizierungsgeheimnis.
- Leiden und zugeordnete Schmerzeinträge mit Verlauf.
- Tägliche Medikamentenpläne, Einnahmeprotokoll und Erinnerungen bei laufender App.
- Menstruationsbeschwerden, Blutungsstärke, Periodenbeginn und erfasste Zykluslängen.
- Responsive PWA für Desktop und mobile Browser; automatische Sperre.
- Verschlüsselter Backup-Download und dokumentierte Vertrauensgrenzen.
- Docker-Installation unter `~/flesh` mit lokalem Port 8083.
- Update-Skript mit Fast-Forward-Prüfung, SQLite-Backup, Healthcheck und Image-Rollback.
- Neutrale Installations- und Entwicklungsdokumentation sowie Feature-Issue-Vorlage.
- CI für Integrationstests, Betriebshelfer, Syntax und Docker-Build.

### Offen

- Web-Push bei geschlossener PWA.
- Passwortwechsel und Wiederherstellungsschlüssel.
- Verschlüsselter Importdialog, Bearbeiten bestehender Einträge und zusätzliche Medikamentenintervalle.
- Test auf einem echten iPhone und unabhängiger Sicherheitsreview.
