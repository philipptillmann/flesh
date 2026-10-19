# Flesh

Flesh ist eine selbst gehostete Docker-App mit responsiver PWA für Desktop und Handy. Keine externen Skripte, Schriftarten, Analytics oder Laufzeit-Abhängigkeiten. Backend: Python 3.12 und SQLite; Frontend: JavaScript und Web Crypto.

## Enthalten

- Mehrere Benutzerkonten mit separaten verschlüsselten Datentresoren.
- Leiden anlegen; Schmerzen einem Leiden zuordnen, Datum, Körperstelle, Stärke 0–10, Notizen und Verlauf.
- Tägliche Medikamentenpläne mit Dosierung, mehreren Uhrzeiten, Start-/Enddatum und Einnahmeprotokoll. Gelöschte Pläne behalten ihren Medikamentennamen im Einnahmeprotokoll.
- Zyklustagebuch mit Blutungsstärke, Periodenbeginn, Beschwerden und Beschwerdestärke; aktueller Zyklustag und bisherige Zykluslängen aus erfassten Periodenbeginnen. Keine Fruchtbarkeitsprognosen.
- Automatische Sperre nach fünf Minuten ohne Aktivität bzw. einer Minute im Hintergrund.
- Verschlüsselter Backup-Download. Änderungen werden erst nach erfolgreicher Serverspeicherung übernommen. Konflikte zwischen Geräten werden abgewiesen; in diesem Fall den nicht gespeicherten Eintrag kopieren, sperren und erneut anmelden.
- Installierbare PWA mit gecachter öffentlicher App-Hülle. Gesundheitsdaten werden nicht im Browser gespeichert. Zum Entsperren und Speichern ist eine Serververbindung erforderlich.

## Installation und Updates

Die vollständige Anleitung für GitHub, Installation unter `~/flesh`, Port `8083`, HTTPS, Handy-Zugriff und `~/flesh/update.sh` steht in [docs/INSTALL.md](docs/INSTALL.md). Für jedes Feature wird ein Issue geführt; siehe [Feature-Stand](docs/FEATURES.md) und [CONTRIBUTING.md](CONTRIBUTING.md).

## Lokal starten

```sh
cd ~/flesh
docker compose up --build -d
```

Dann `http://localhost:8083` öffnen und einen Account erstellen. Ohne Docker:

```sh
python3 server.py
```

Python legt die Daten unter `data/health.sqlite3` ab. Docker verwendet das persistente Volume `health-data`. `docker compose down` behält die Daten; `docker compose down -v` löscht sie. Kein Passwort und keine Gesundheitsdaten als Umgebungsvariablen konfigurieren.

## Auf dem eigenen Server / iPhone

1. Projekt auf den Server kopieren, `.env.example` als `.env` ablegen und `APP_ORIGIN` auf die tatsächliche HTTPS-Adresse setzen, z. B. `https://flesh.example.org`.
2. `docker compose up --build -d` ausführen. Der App-Port bindet ausschließlich an `127.0.0.1:8083`.
3. Einen vorhandenen Reverse Proxy mit TLS auf diesen Port richten. Beispielsweise mit Caddy auf dem Host:

   ```caddyfile
   flesh.example.org {
       reverse_proxy 127.0.0.1:8083
   }
   ```

   Läuft der Reverse Proxy selbst in Docker, beide Dienste in dasselbe Docker-Netz aufnehmen und `health:8080` als Ziel verwenden; Loopback im Proxy-Container bezeichnet nicht den Host.
4. Auf dem iPhone in Safari öffnen → Teilen → „Zum Home-Bildschirm“. HTTPS ist für Web Crypto, Service Worker und Zugriff vom Handy erforderlich. HTTP über eine LAN-IP funktioniert nicht; nur `localhost` darf für lokale Entwicklung HTTP nutzen.

`APP_ORIGIN` muss einschließlich Schema und gegebenenfalls Port zur Browseradresse passen. Es werden keine CORS-Freigaben verwendet. Bei HTTPS erhält das Sitzungscookie zusätzlich `Secure`. Der Proxy muss die URL ohne Pfadpräfix weiterleiten. Ein sinnvoller Request-Body-Grenzwert ist 2 MB; zusätzlich sollten am Reverse Proxy Verbindungs-, Zeit- und Ratenlimits gesetzt werden.

## Verschlüsselung und Vertrauensgrenzen

- Der Browser erzeugt pro Account 32 zufällige Salt-Bytes und leitet den nicht exportierbaren AES-256-GCM-Schlüssel mit PBKDF2-HMAC-SHA-256 / 600.000 Iterationen aus dem Passwort ab.
- Jede Speicherung verwendet einen neuen zufälligen 96-Bit-IV und authentifizierte Formatkennung. Alle Leiden, Medikamente, Uhrzeiten, Einnahmen, Zyklusdaten und Notizen liegen gemeinsam im verschlüsselten Tresor.
- Der Server erhält weder Passwort noch Datenschlüssel. Zur Anmeldung sendet der Browser ein getrennt abgeleitetes Authentifizierungsgeheimnis mit eigenem Salt-Kontext. Dieses wird serverseitig nochmals mit zufälligem Salt und scrypt gehasht. Das gesendete Authentifizierungsgeheimnis ist selbst ein Zugangsnachweis und muss durch TLS geschützt werden.
- Technische Metadaten bleiben lesbar: Benutzername, Kontokennung, Salts, Passwortprüfwert, Tresorgröße/-revision und gehashte Sitzungstokens mit Ablaufzeit. Reverse-Proxy-Logs können zusätzlich IP und Zugriffszeiten enthalten.
- Sitzungen: zufälliges 256-Bit-Token, nur gehasht gespeichert, zwölf Stunden Laufzeit; HttpOnly-/SameSite-Strict-Cookies, Prüfung des exakten Origin bei Schreibzugriffen. Begrenzung fehlgeschlagener Anmeldungen pro Benutzername im Arbeitsspeicher.
- Schlüssel und Klartext liegen nur im Arbeitsspeicher des entsperrten Browsers. Beim Sperren werden Referenzen entfernt und die Oberfläche geleert; eine garantierte physische Speicherlöschung durch JavaScript ist nicht möglich.
- **Schutz bei Einsicht in Serverablage und Backups:** Gesundheitsdaten bleiben verschlüsselt. Ein schwaches Passwort kann bei Datenbankdiebstahl offline erraten werden; ein starkes, einzigartiges Passwort ist erforderlich.
- **Kein Schutz gegen aktiv manipulierten Webcode:** Ein kompromittierter Server könnte verändertes JavaScript ausliefern, das beim nächsten Entsperren Daten abgreift. Browser-Erweiterungen und ein kompromittiertes Endgerät sind ebenfalls außerhalb dieses Schutzes. Für eine stärkere Trennung wäre eine unabhängig verteilte und geprüfte native App nötig.
- Jeder Browser mit Account und Passwort kann entschlüsseln. Eine kryptografische Bindung an genau ein Handy ist nicht implementiert; Desktop-Nutzung ist ausdrücklich möglich.

## Erinnerungen

Die App prüft bei laufendem, entsperrtem Journal alle 15 Sekunden auf fällige tägliche Einnahmen. Nach erteilter Browserberechtigung erscheint eine generische Nachricht ohne Medikamentennamen; zusätzlich gibt es einen Hinweis in der App. Hintergrund-Tabs können vom Betriebssystem pausiert werden. Nachträglich geöffnete Apps holen verpasste Erinnerungen nicht nach.

**Es gibt noch keinen Web-Push für geschlossene Apps.** Gerade auf iPhones reichen Browser-Timer dafür nicht. iOS unterstützt Web-Push erst für installierte Home-Bildschirm-Web-Apps ab iOS 16.4; diese Integration ist ein nächster Schritt. Für verlässliche Einnahmeerinnerungen bis dahin Systemwecker verwenden. Die aktuelle Funktion ersetzt keinen zuverlässigen medizinischen Alarm.

## Backups und Wiederherstellung

Das komplette Docker-Datenvolume enthält verschlüsselte Gesundheitsdaten, aber auch Konto- und Sitzungsmetadaten. Regelmäßig sichern. Für eine konsistente Dateisicherung den Dienst stoppen und das **gesamte Volume** sichern, anschließend wieder starten; nicht nur die SQLite-Datei während des Betriebs kopieren (WAL-Dateien gehören dazu). Alternativ die SQLite-Backup-API nutzen. Zur Wiederherstellung das gesicherte Volume einer gestoppten Instanz ersetzen und mit demselben Passwort anmelden.

Der Download in der App enthält das Schlüsselsalz und den verschlüsselten Tresor, keine Kontozugangsdaten. Ein UI-Import und Wiederherstellungsschlüssel sind noch nicht enthalten. Ohne Passwort können die Inhalte nicht wiederhergestellt werden. Passwortwechsel und Accountlöschung folgen ebenfalls in einer späteren Version.

## Prüfen

Python 3.12+ und Node.js 22+:

```sh
node --test tests/integration.mjs
python3 -m py_compile server.py
node --check public/app.js
node --check public/crypto.js
```

Die Integrationstests starten eine temporäre Datenbank und prüfen Anmeldung, verschlüsseltes Schreiben/Lesen, erneute Schlüsselableitung, Nutzertrennung, Konflikte, Manipulationserkennung, Origin-Prüfung und Session-Header. Sie benötigen einen freien lokalen Port 18081.

Optionaler Browsertest (installiertes Python-Playwright und Chromium unter `/usr/bin/chromium`):

```sh
python3 tests/browser.py
```

Der Test prüft die zentralen Bedienabläufe und mobile Breite; Screenshots liegen unter `/tmp/health-desktop.png` und `/tmp/health-mobile.png`. Ein echter Safari-/iPhone-Test steht noch aus.

## Stand und nächste Schritte

Dies ist ein funktionaler erster Entwicklungsstand, noch keine unabhängig sicherheitsgeprüfte Gesundheitsanwendung. Geplant sind insbesondere Web-Push, verschlüsselter Import, Passwortwechsel/Wiederherstellungsschlüssel, Bearbeiten bestehender Einträge, erweiterte Medikamentenintervalle und ein externer Sicherheitsreview. Registrierung ist derzeit offen, sobald die Instanz erreichbar ist; für einen privaten Betrieb zunächst den Zugriff am Reverse Proxy oder per VPN begrenzen.
