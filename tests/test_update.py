"""Exercise update decisions without touching real Git remotes or Docker data."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
DISPATCH = '''#!/usr/bin/env python3
import os,sys
from pathlib import Path
name=Path(sys.argv[0]).name
args=sys.argv[1:]
root=Path(os.environ['TEST_STATE'])
mode=os.environ.get('TEST_MODE','ok')
with (root/'calls').open('a') as f:f.write(name+' '+' '.join(args)+'\\n')
if name=='git':
 if args[:1]==['symbolic-ref']:print('server')
 elif args[:1]==['status']:print(' M README.md' if mode=='dirty' else '',end='')
 elif args[:1]==['rev-parse']:print('new-commit' if (root/'merged').exists() else 'old-commit')
 elif args[:1]==['merge-base'] and mode=='diverged':sys.exit(1)
 elif args[:1]==['merge']:(root/'merged').touch()
elif name=='docker':
 if args==['info'] and mode=='docker-access':sys.exit(1)
 elif args==['compose','version'] and mode=='compose-missing':sys.exit(1)
 elif args==['compose','ps','-q','health']:
  if mode not in ('initial','initial-health'):print('old-container')
 elif args[:1]==['inspect']:print('sha256:old-image')
 elif args[:2]==['compose','build'] and mode=='build':sys.exit(1)
 elif args[:2]==['compose','run']:
  if mode in ('initial','initial-health'):sys.exit(3)
  if mode=='backup':sys.exit(2)
  sys.stdout.buffer.write(b'SQLite backup fixture')
 elif args[:2]==['compose','up']:
  countfile=root/'up-count'
  count=int(countfile.read_text())+1 if countfile.exists() else 1
  countfile.write_text(str(count))
  if mode=='initial-health' or (mode=='health' and count==1):sys.exit(1)
'''


class UpdateTests(unittest.TestCase):
    def run_update(self, mode):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        base = Path(temp.name)
        app = base/'app'
        app.mkdir()
        (app/'.git').mkdir()
        (app/'.env').write_text('APP_ORIGIN=https://flesh.example.org\n')
        shutil.copy(ROOT/'update.sh', app/'update.sh')
        binaries = base/'bin'
        binaries.mkdir()
        for name in ('git','docker'):
            script = binaries/name
            script.write_text(DISPATCH)
            script.chmod(0o755)
        env = {**os.environ, 'PATH': str(binaries)+os.pathsep+os.environ['PATH'], 'TEST_STATE': str(base), 'TEST_MODE': mode}
        result = subprocess.run(['bash', str(app/'update.sh')], cwd='/', env=env, capture_output=True, text=True)
        calls = (base/'calls').read_text()
        return result, calls, app

    def test_success_creates_backup_before_replacement(self):
        result, calls, app = self.run_update('ok')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(calls.index('compose run'), calls.index('compose up'))
        snapshots = list((app/'backups').glob('*.sqlite3'))
        self.assertEqual(len(snapshots), 1)
        self.assertEqual(snapshots[0].read_bytes(), b'SQLite backup fixture')
        self.assertEqual(snapshots[0].stat().st_mode & 0o777, 0o600)
        self.assertEqual(Path(str(snapshots[0])+'.commit').read_text(), 'old-commit\n')
        self.assertEqual((app/'.env').read_text(), 'APP_ORIGIN=https://flesh.example.org\n')

    def test_dirty_tree_stops_before_fetch(self):
        result, calls, _ = self.run_update('dirty')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('git fetch', calls)

    def test_divergent_history_is_not_overwritten(self):
        result, calls, _ = self.run_update('diverged')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('git merge --ff-only', calls)
        self.assertNotIn('compose build', calls)

    def test_build_failure_keeps_current_container(self):
        result, calls, _ = self.run_update('build')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('compose up', calls)

    def test_backup_failure_keeps_current_container(self):
        result, calls, app = self.run_update('backup')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('compose up', calls)
        self.assertFalse(list((app/'backups').glob('*.partial')))

    def test_first_install_without_database_starts(self):
        result, calls, _ = self.run_update('initial')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('compose up', calls)
        self.assertNotIn('flesh-server:rollback', calls)

    def test_failed_healthcheck_restores_old_image_and_reports_failure(self):
        result, calls, _ = self.run_update('health')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('docker image tag flesh-server:rollback flesh-server:local', calls)
        self.assertEqual(calls.count('docker compose up'), 2)

    def test_initial_failure_has_no_rollback_image(self):
        result, calls, _ = self.run_update('initial-health')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls.count('docker compose up'), 1)
        self.assertNotIn('flesh-server:rollback', calls)

    def test_missing_docker_access_stops_before_fetch(self):
        result, calls, _ = self.run_update('docker-access')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Docker is not accessible', result.stderr)
        self.assertNotIn('git fetch', calls)
        self.assertNotIn('compose build', calls)
        self.assertNotIn('compose up', calls)

    def test_missing_compose_has_clear_error_before_fetch(self):
        result, calls, _ = self.run_update('compose-missing')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Docker Compose is unavailable', result.stderr)
        self.assertNotIn('git fetch', calls)

    def test_user_checkout_updates_from_another_working_directory(self):
        result, calls, _ = self.run_update('ok')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('compose up', calls)
        self.assertNotIn('sudo', calls)


if __name__ == '__main__':
    unittest.main()
