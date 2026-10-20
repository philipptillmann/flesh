# Entwicklung und Feature-Verfolgung

Die Docker-/PWA-Anwendung wird im Branch `server` entwickelt.

Für jeden Feature-Request wird vor der Implementierung ein GitHub-Issue angelegt. Ein Issue enthält Zielverhalten, abhakbare Akzeptanzkriterien und die vorgesehenen Prüfungen. Für bereits vorhandene Funktionen können rückwirkende Issues angelegt werden. Nach Umsetzung werden Commit und Ergebnisse verlinkt, die Kriterien abgehakt und das Issue nach dem Push geschlossen. Unvollständige Anforderungen bleiben offen.

Erweiterungen wie Web-Push, Wiederherstellungsdialoge oder ein endgültiges Logo dürfen nicht als abgeschlossen markiert werden, bevor sie tatsächlich implementiert und geprüft sind. Der aktuelle Umfang und Einschränkungen stehen in README und Changelog.

## Datenschutz im Repository

Keine persönlichen Namen, E-Mail-Adressen, echten Hosts/IPs, Zugangsdaten, private Infrastrukturdetails, Gesundheitsdaten oder Backups in Code, Issues, Screenshots, Commit-Nachrichten oder Dokumentation aufnehmen. Für Beispiele `OWNER`, reservierte Domains wie `flesh.example.org` und synthetische Testdaten verwenden. Die lokale `.env`, Daten und Backups bleiben unversioniert.

Für anonyme Commit-Zuordnung können nur in diesem Checkout folgende Einstellungen verwendet werden:

```sh
git config user.name 'Flesh Contributors'
git config user.email 'contributors@flesh.invalid'
```

Die GitHub-Repository-Zuordnung und GitHub-Aktivitäten selbst bleiben auf der Plattform sichtbar; diese Einstellungen anonymisieren kein GitHub-Konto.

## Prüfungen

```sh
node --test tests/*.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
bash -n update.sh
python3 -m py_compile server.py ops.py
node --check public/app.js
node --check public/crypto.js
node --check public/sw.js
docker compose config --quiet
docker build -t flesh-check .
```

`tests/browser.py` bietet zusätzlich einen lokalen Chromium-Bedientest, wenn Python-Playwright und Chromium installiert sind. Der Test verwendet ausschließlich synthetische Gesundheitsdaten. Keine Screenshots mit echten Einträgen hochladen.

## Initiale Feature-Issues synchronisieren

Die neutralen Ausgangsanforderungen stehen in `.github/features.json`. Mit einem lokal autorisierten GitHub CLI können die Issues wiederholbar angelegt werden:

```sh
python3 scripts/sync-issues.py --repo OWNER/flesh
```

Nach erfolgreichen Prüfungen und Push des exakten Commits in den Branch `server`:

```sh
python3 scripts/sync-issues.py --repo OWNER/flesh --close-implemented
```

Der zweite Aufruf prüft, dass lokaler HEAD und veröffentlichter `server`-Commit übereinstimmen und der Checkout sauber ist. Er hakt die dokumentierten implementierten Kriterien ab und schließt die zugehörigen Issues. Web-Push und Logo bleiben offen. Die versteckte Feature-Kennung verhindert doppelte Issues bei Wiederholung; bestehende Diskussionen werden nicht gelöscht.
