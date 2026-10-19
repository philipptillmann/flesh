"""Optional UI smoke test. Requires Playwright and Chromium already installed."""
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as temp:
    env = {**os.environ, 'PORT': '18083', 'APP_ORIGIN': 'http://localhost:18083', 'DATABASE_PATH': temp+'/test.sqlite'}
    server = subprocess.Popen(['python3', 'server.py'], cwd=ROOT, env=env)
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen('http://localhost:18083/api/health')
                break
            except OSError:
                time.sleep(.05)
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
            page = browser.new_page(viewport={'width': 1440, 'height': 1000})
            page.set_default_timeout(10000)
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://localhost:18083')
            page.get_by_role('button', name='Noch kein Account? Jetzt anlegen').click()
            page.get_by_label('Benutzername').fill('browser-test')
            page.get_by_label('Passwort', exact=True).fill('Browser test password 3491!')
            page.get_by_label('Passwort wiederholen').fill('Browser test password 3491!')
            page.get_by_role('button', name='Account erstellen').click()
            page.get_by_role('heading', name='Wie geht es dir heute?').wait_for()
            page.locator('nav').get_by_role('button', name='Schmerzen').click()
            page.get_by_label('Neues Leiden').fill('Migräne <script>throw 1</script>')
            page.get_by_role('button', name='Leiden hinzufügen').click()
            page.get_by_role('button', name='Eintrag speichern').wait_for()
            page.get_by_label('Körperstelle').fill('Rechte Schläfe')
            page.get_by_label('Notizen').fill('Nach einem langen Arbeitstag')
            page.get_by_role('button', name='Eintrag speichern').click()
            page.locator('.entry strong').filter(has_text='Migräne').wait_for()
            page.locator('nav').get_by_role('button', name='Medikamente').click()
            page.get_by_label('Name', exact=True).fill('Beispielmedikament')
            page.get_by_label('Dosierung').fill('1 Tablette')
            page.get_by_label('Täglich um').fill('08:00, 20:00')
            page.get_by_role('button', name='Plan speichern').click()
            page.get_by_role('button', name='Einnahme bestätigen').first.wait_for()
            page.get_by_role('button', name='Einnahme bestätigen').first.click()
            page.get_by_role('button', name='✓ Eingenommen').wait_for()
            page.locator('nav').get_by_role('button', name='Zyklus', exact=False).click()
            page.get_by_label('Erster Tag einer neuen Periode').check()
            page.get_by_label('Blutung', exact=True).select_option('Mittel')
            page.get_by_label('Krämpfe', exact=True).check()
            page.get_by_role('button', name='Zykluseintrag speichern').click()
            page.locator('.entry strong').filter(has_text='Periodenbeginn').wait_for()
            page.locator('nav').get_by_role('button', name='Übersicht').click()
            assert page.evaluate('Object.keys(localStorage).length + Object.keys(sessionStorage).length') == 0
            page.screenshot(path='/tmp/health-desktop.png', full_page=True)
            page.set_viewport_size({'width':390,'height':844})
            page.screenshot(path='/tmp/health-mobile.png', full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile page overflows'
            page.get_by_role('button', name='Sperren ◇').click()
            page.get_by_label('Benutzername').fill('browser-test')
            page.get_by_label('Passwort', exact=True).fill('Browser test password 3491!')
            page.get_by_role('button', name='Journal entsperren').click()
            page.get_by_role('heading', name='Wie geht es dir heute?').wait_for()
            page.locator('.entry strong').filter(has_text='Migräne').wait_for()
            assert not errors, errors
            browser.close()
            print('PASS: register, pain/condition, medication/intake, cycle, mobile layout, lock/login, persistence, no web-storage plaintext, no JS errors')
    finally:
        server.terminate()
        server.wait()
