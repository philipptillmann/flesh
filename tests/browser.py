"""UI regression test with synthetic data, including a pre-observations vault."""
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PASSWORD = 'Browser test password 3491!'
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
            page.get_by_role('button', name='Account erstellen', exact=True).click()
            page.get_by_label('Benutzername').fill('browser-test')
            page.get_by_label('Passwort', exact=True).fill(PASSWORD)
            page.get_by_label('Passwort wiederholen').fill(PASSWORD)
            page.get_by_role('button', name='Account erstellen', exact=True).click()
            page.get_by_role('heading', name='Übersicht', exact=True).wait_for()
            # Store a legacy encrypted journal, with no observations property.
            page.evaluate('''async password => {
                const {vaultKey,encrypt}=await import('/crypto.js');
                const v=await (await fetch('/api/vault')).json();
                const key=await vaultKey(password,v.keySalt);
                const legacy={version:1,conditions:[{id:'old-topic',name:'Bestandsthema'}],
                  pain:[{id:'old-pain',conditionId:'old-topic',date:'2026-01-01',level:4,location:'Rücken',note:'Alter Schmerzeintrag'}],
                  cycles:[{id:'old-cycle',date:'2026-01-02',flow:'Leicht',symptoms:[],level:0,periodStart:true,note:'Alter Menstruationseintrag'}],
                  meds:[],intakes:[],extension:{kept:true}};
                const res=await fetch('/api/vault',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:v.revision,vault:await encrypt(key,legacy)})});
                if(!res.ok)throw new Error('Legacy fixture failed');
            }''', PASSWORD)
            def login_again():
                page.get_by_role('button', name='Journal sperren').click()
                page.get_by_label('Benutzername').fill('browser-test')
                page.get_by_label('Passwort', exact=True).fill(PASSWORD)
                page.get_by_role('button', name='Journal entsperren').click()
                page.get_by_role('heading', name='Übersicht', exact=True).wait_for()
            login_again()
            page.get_by_text('Alter Schmerzeintrag', exact=True).wait_for()
            page.get_by_text('Alter Menstruationseintrag', exact=True).wait_for()
            page.locator('nav').get_by_role('button', name='Beobachtungen', exact=True).click()
            assert page.locator('nav').get_by_role('button', name='Zyklus', exact=True).count()==0
            assert page.locator('nav').get_by_role('button', name='Schmerzen', exact=True).count()==0
            page.get_by_label('Neues Thema').fill('Schlaf <script>throw 1</script>')
            page.get_by_role('button', name='Thema hinzufügen').click()
            page.locator('.chip').filter(has_text='Schlaf').wait_for()
            page.get_by_label('Beobachtung', exact=True).fill('Erholsamer Schlaf')
            page.get_by_label('Einordnung').select_option('Positiv')
            page.get_by_label('Messwert (optional)').fill('8')
            page.get_by_label('Einheit (optional)').fill('Stunden')
            page.get_by_role('button', name='Beobachtung speichern').click()
            page.locator('.entry[data-kind="general"] strong').filter(has_text='Erholsamer Schlaf').wait_for()
            page.get_by_label('Art der Beobachtung').select_option('pain')
            page.get_by_label('Thema (optional)').select_option('old-topic')
            page.get_by_label('Körperstelle').fill('Rechte Schläfe')
            page.get_by_label('Notizen').fill('Neuer Schmerzeintrag')
            page.get_by_role('button', name='Beobachtung speichern').click()
            page.get_by_text('Neuer Schmerzeintrag', exact=True).wait_for()
            page.get_by_label('Art der Beobachtung').select_option('cycle')
            page.get_by_label('Erster Tag einer neuen Periode').check()
            page.get_by_label('Blutung', exact=True).select_option('Mittel')
            page.get_by_label('Krämpfe', exact=True).check()
            page.get_by_role('button', name='Beobachtung speichern').click()
            page.locator('.entry[data-kind="cycle"] strong').filter(has_text='Periodenbeginn').wait_for()
            page.get_by_label('Art filtern').select_option('cycle')
            assert page.locator('.entry[data-kind="general"]').count()==0
            assert page.locator('.entry[data-kind="pain"]').count()==0
            assert page.locator('.entry[data-kind="cycle"]').count()==2
            page.get_by_label('Art filtern').select_option('all')
            page.locator('nav').get_by_role('button', name='Medikamente').click()
            page.get_by_label('Name', exact=True).fill('Beispielmedikament')
            page.get_by_label('Dosierung').fill('1 Tablette')
            page.get_by_label('Täglich um').fill('08:00, 20:00')
            page.get_by_role('button', name='Plan speichern').click()
            page.get_by_role('button', name='Einnahme bestätigen').first.wait_for()
            page.get_by_role('button', name='Einnahme bestätigen').first.click()
            page.get_by_role('button', name='✓ Eingenommen').wait_for()
            page.locator('nav').get_by_role('button', name='Übersicht').click()
            assert page.evaluate('Object.keys(localStorage).length + Object.keys(sessionStorage).length') == 0
            page.screenshot(path='/tmp/health-desktop.png', full_page=True)
            page.set_viewport_size({'width':390,'height':844})
            page.screenshot(path='/tmp/health-mobile.png', full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            page.get_by_role('button', name='Sperren ◇').click()
            page.get_by_label('Benutzername').fill('browser-test')
            page.get_by_label('Passwort', exact=True).fill(PASSWORD)
            page.get_by_role('button', name='Journal entsperren').click()
            page.get_by_role('heading', name='Übersicht', exact=True).wait_for()
            page.get_by_text('Erholsamer Schlaf', exact=True).wait_for()
            # Check actual persisted collections, not only the rendered feed.
            saved=page.evaluate('''async password=>{
              const {vaultKey,decrypt}=await import('/crypto.js');
              const v=await (await fetch('/api/vault')).json();
              return decrypt(await vaultKey(password,v.keySalt),v.vault);
            }''', PASSWORD)
            assert len(saved['pain'])==2 and len(saved['cycles'])==2
            assert saved['observations'][0]['title']=='Erholsamer Schlaf'
            assert saved['extension']['kept'] is True
            page.locator('nav').get_by_role('button', name='Beobachtungen', exact=True).click()
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            page.get_by_label('Beobachtung', exact=True).fill('Bewegung')
            page.get_by_role('button', name='Beobachtung speichern').click()
            mobile_entry=page.locator('.entry[data-kind="general"]').filter(has_text='Bewegung')
            mobile_entry.wait_for()
            page.once('dialog', lambda dialog: dialog.accept())
            mobile_entry.get_by_role('button', name='Eintrag löschen').click()
            mobile_entry.wait_for(state='detached')
            assert page.locator('.entry[data-kind="pain"]').count()==2
            assert page.locator('.entry[data-kind="cycle"]').count()==2
            assert page.locator('.entry[data-kind="general"]').count()==1
            page.screenshot(path='/tmp/health-observations-mobile.png', full_page=True)
            assert not errors, errors
            browser.close()
            print('PASS: legacy vault, general/positive observations, unified pain/menstruation feed, filters, medications, mobile layout, lock/login and encrypted persistence')
    finally:
        server.terminate()
        server.wait()
