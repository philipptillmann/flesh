import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class BackupTests(unittest.TestCase):
    def test_backup_includes_committed_wal_and_is_readable(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source.sqlite3'
            db = sqlite3.connect(source)
            try:
                db.execute('PRAGMA journal_mode=WAL')
                db.execute('CREATE TABLE records (ciphertext TEXT)')
                db.execute('INSERT INTO records VALUES (?)', ('encrypted-example',))
                db.commit()
                result = subprocess.run([sys.executable, str(ROOT/'ops.py'), 'backup'], env={**os.environ, 'DATABASE_PATH': str(source)}, capture_output=True, check=True)
                snapshot = Path(temp) / 'backup.sqlite3'
                snapshot.write_bytes(result.stdout)
                with sqlite3.connect(snapshot) as restored:
                    self.assertEqual(restored.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
                    self.assertEqual(restored.execute('SELECT ciphertext FROM records').fetchone()[0], 'encrypted-example')
            finally:
                db.close()

    def test_missing_database_is_first_install_not_an_empty_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            result = subprocess.run([sys.executable, str(ROOT/'ops.py'), 'backup'], env={**os.environ, 'DATABASE_PATH': temp+'/absent.sqlite'}, capture_output=True)
            self.assertEqual(result.returncode, 3)
            self.assertEqual(result.stdout, b'')


if __name__ == '__main__':
    unittest.main()
