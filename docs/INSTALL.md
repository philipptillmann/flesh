# Installation, HTTPS und Updates

Die folgenden Befehle sind generische Beispiele für einen Linux-Host. Alle tatsächlichen Zugangsdaten und Adressen gehören ausschließlich in lokale Konfiguration. `OWNER`, `flesh.example.org` und Zertifikatskonfiguration müssen lokal ersetzt werden.

## Voraussetzungen

- Normales Benutzerkonto mit Schreibrechten im eigenen Home-Verzeichnis und Zugriff auf Docker.
- Git, Docker Engine mit laufendem Dienst und Docker Compose Plugin **2.20 oder neuer** (`docker compose`, nicht das alte `docker-compose`). `flock` aus `util-linux` wird vom Update-Skript benötigt.
- Eine HTTPS-Adresse für den mobilen Zugriff und ein Reverse Proxy, z. B. Caddy oder Nginx.
- Bei einem privaten Repository: ein nur für dieses Repository berechtigter SSH-Deploy-Key oder ein lokal angemeldeter GitHub-CLI-Zugang. Zugangstokens niemals in Clone-URLs, Skripte oder `.env` schreiben.

Docker entsprechend der offiziellen Anleitung für die Distribution installieren: <https://docs.docker.com/engine/install/>. Danach prüfen:

```sh
command -v git flock
docker version
docker info
docker compose version
```

Flesh verlangt keine Root-Shell und startet selbst kein `sudo`. `docker info` muss mit dem normalen Benutzer funktionieren. Falls der Zugriff fehlt, Docker-Dienst und die Berechtigungen des Benutzers prüfen lassen. Die Docker-Gruppe verleiht weitreichende Host-Rechte und sollte nur bewusst vergeben werden.

## Repository herunterladen

Standard per SSH (Repository-Zugriff für das normale Benutzerkonto muss zuvor eingerichtet sein):

```sh
cd ~
git clone --branch server --single-branch git@github.com:OWNER/flesh.git ~/flesh
cd ~/flesh
cp .env.example .env
chmod 600 .env
nano .env
```

Alternativ mit angemeldetem GitHub CLI:

```sh
gh repo clone OWNER/flesh ~/flesh -- --branch server --single-branch
```

Nicht beide Clone-Varianten nacheinander ausführen. Ein bereits vorhandenes `~/flesh` zuerst prüfen; keine vorhandenen Installationen überschreiben. Bei SSH muss der GitHub-Hostschlüssel anhand der offiziellen Fingerprints geprüft werden; keine deaktivierte Hostschlüsselprüfung verwenden.

In `.env` die genaue öffentliche URL eintragen:

```dotenv
APP_ORIGIN=https://flesh.example.org
```

Kein abschließender Pfad; ein tatsächlich genutzter abweichender HTTPS-Port gehört zur URL. `.env` ist von Git und dem Docker-Build ausgeschlossen.

## Installieren

```sh
chmod 700 ~/flesh/update.sh
~/flesh/update.sh
```

Das Skript lädt `origin/server`, baut das Image und startet Compose. Beim ersten Start wird das Datenvolume automatisch angelegt; ohne vorhandene Datenbank wird noch kein Backup erstellt. Der Dienst läuft als Benutzer mit UID 10001 im Container, unabhängig vom Benutzer, der das Update startet.

Der HTTP-Upstream ist ausschließlich lokal erreichbar:

```text
127.0.0.1:8083 → Container:8080
```

Prüfen:

```sh
cd ~/flesh
docker compose ps
curl --fail http://127.0.0.1:8083/api/health
```

Die Antwort muss `{"ok": true}` sein. Daten liegen im Docker-Volume `flesh_health-data`, nicht im Git-Checkout. Der Projektname ist in Compose auf `flesh` festgelegt, damit ein anderer Aufrufpfad kein neues Datenvolume erzeugt.

## HTTPS und Zugriff vom Handy

Für einen auf dem Host installierten Caddy in dessen Konfiguration ergänzen:

```caddyfile
flesh.example.org {
    request_body {
        max_size 2MB
    }
    reverse_proxy 127.0.0.1:8083
}
```

DNS und Firewall müssen den HTTPS-Zugriff ermöglichen; Caddy benötigt für die übliche automatische Zertifikatsausstellung erreichbare Ports 80/443. Vorhandene Caddy-Konfiguration ergänzen, nicht ersetzen. Anschließend die Konfiguration prüfen und den Dienst gemäß seiner Installation neu laden.

**Port 8083 ist der lokale App-Port.** Auf dem Handy wird normalerweise `https://flesh.example.org` über HTTPS-Port 443 geöffnet. `http://HOST-IP:8083` ist weder öffentlich freigegeben noch als mobile PWA geeignet: Web Crypto und Service Worker benötigen einen sicheren Browserkontext. Ein VPN allein macht eine HTTP-IP-Adresse nicht zu HTTPS.

Läuft der Reverse Proxy in Docker, benötigt er ein gemeinsames Netzwerk mit dem Dienst. Das Upstream-Ziel ist dann `health:8080`; `127.0.0.1` innerhalb des Proxy-Containers ist nicht der Docker-Host. Alternativ kann ein vorhandener Proxy über seine eingerichtete Host-Anbindung den lokalen Upstream erreichen.

Auf dem iPhone:

1. Die HTTPS-Adresse in Safari öffnen.
2. Account erstellen; ein starkes, einzigartiges Passwort im Passwortmanager aufbewahren.
3. Teilen → „Zum Home-Bildschirm“ → „Hinzufügen“.
4. Flesh vom Home-Bildschirm öffnen und anmelden.

Android: HTTPS-Adresse in Chrome öffnen und im Browsermenü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen. Desktop: dieselbe HTTPS-Adresse verwenden.

Erinnerungen funktionieren derzeit nur bei laufender, entsperrter App. Web-Push für geschlossene Apps ist noch offen. Ein verlorenes Passwort kann derzeit nicht zurückgesetzt werden, ohne den Zugang zu den verschlüsselten Gesundheitsdaten zu verlieren.

## Aktualisieren

Falls noch eine ältere Version des Skripts mit Root-Pflicht vorhanden ist, einmalig direkt über Git aktualisieren:

```sh
cd ~/flesh
git pull --ff-only origin server
~/flesh/update.sh
```

Danach genügt der direkte Skriptaufruf. Falls der Checkout zuvor mit `sudo` angelegt oder verschoben wurde, die Dateieigentümerschaft einmalig administrativ korrigieren lassen. Ein bereits funktionierender Checkout außerhalb des Home-Verzeichnisses muss nicht verschoben werden: Das Skript ermittelt seinen Installationspfad selbst. Bestehende Datenvolumes und `.env` bleiben erhalten.

Aus jedem Arbeitsverzeichnis deines normalen Benutzerkontos:

```sh
~/flesh/update.sh
```

Das Skript:

1. Verhindert parallele Updates durch eine Sperrdatei.
2. Prüft Branch `server`, einen sauberen Checkout und eine vorhandene `.env`.
3. Holt `origin/server` und akzeptiert ausschließlich Fast-Forward-Updates.
4. Prüft Compose und baut das neue Image, während die bisherige App weiterläuft.
5. Erstellt vor einem Neustart ein konsistentes SQLite-Backup einschließlich aktueller WAL-Inhalte unter `~/flesh/backups/`. Das Backup enthält verschlüsselte Gesundheitsdaten und technische Kontodaten. Eine `.commit`-Datei nennt den bisher ausgecheckten Commit.
6. Startet die neue Version und wartet bis zu 90 Sekunden auf den Healthcheck.
7. Stellt bei fehlgeschlagenem Start das vorherige Container-Image wieder her, sofern eine laufende Instanz vorhanden war.

Die lokale `.env`, Backups und Datenvolumes bleiben erhalten. Änderungen an versionierten Dateien oder unerwartete unversionierte Dateien stoppen das Update. Bei einem Build- oder Backupfehler wird der laufende Container nicht ersetzt. Der Checkout kann dann bereits auf dem neuen Commit stehen; nach Behebung einfach erneut starten.

Der automatische Rollback betrifft nur das Container-Image und verwendet die aktuelle Compose-Konfiguration. Er setzt weder Datenbank noch Checkout zurück. Falls zukünftige Releases Datenbankmigrationen einführen, sind deren Wiederherstellungshinweise vor dem Update zu lesen. Die aktuelle Version besitzt keine automatischen Schemamigrationen. Nach einem erfolgreichen Update bleiben das letzte Rollback-Image und die Backups erhalten; alte Backups separat verwalten und bei Bedarf verschlüsselt extern sichern.

## Diagnose und Neustart

```sh
cd ~/flesh
docker compose ps
docker compose logs --tail 100 health
docker compose restart health
```

„Ungültiger Ursprung“ bedeutet meist, dass `.env` und die tatsächliche Browser-URL nicht übereinstimmen. Nach einer `.env`-Änderung `docker compose up -d --force-recreate health` ausführen; ein einfacher Neustart übernimmt keine geänderten Umgebungsvariablen.

Nie `docker compose down -v` als Update verwenden: `-v` löscht die Datenvolumes.

## Datenbank wiederherstellen

Das löscht den aktuellen Datenstand zugunsten eines ausgewählten Backups. Zuerst eine zusätzliche Sicherung anlegen und den exakten Backupnamen festlegen. Bei gestopptem Dienst:

```sh
cd ~/flesh
docker compose stop health
docker compose run --rm --no-deps -T health python -c 'import os,sys; from pathlib import Path; p=Path(os.environ["DATABASE_PATH"]); p.write_bytes(sys.stdin.buffer.read()); os.chmod(p,0o600); [Path(str(p)+s).unlink(missing_ok=True) for s in ("-wal","-shm")]' < backups/BACKUP.sqlite3
docker compose up -d health
```

Nur ein vorher geprüftes, vollständiges SQLite-Backup verwenden. Die passenden Passwörter sind weiterhin erforderlich.
