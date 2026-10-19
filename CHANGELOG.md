# Changelog

## Unreleased

### Implementiert

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
- Endgültiges Logo und gegebenenfalls angepasste Farbgestaltung.
- Passwortwechsel und Wiederherstellungsschlüssel.
- Verschlüsselter Importdialog, Bearbeiten bestehender Einträge und zusätzliche Medikamentenintervalle.
- Test auf einem echten iPhone und unabhängiger Sicherheitsreview.
