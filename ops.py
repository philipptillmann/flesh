"""Operational helpers. Backups contain encrypted records and account metadata."""
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
from urllib.parse import quote


def backup():
    source = Path(os.environ.get('DATABASE_PATH', '/app/data/health.sqlite3'))
    if not source.is_file():
        print('No database yet; initial installation.', file=sys.stderr)
        return 3
    with tempfile.TemporaryDirectory() as temp:
        destination = Path(temp) / 'snapshot.sqlite3'
        src = sqlite3.connect('file:' + quote(str(source), safe='/') + '?mode=ro', uri=True)
        dst = sqlite3.connect(destination)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        with destination.open('rb') as snapshot:
            shutil.copyfileobj(snapshot, sys.stdout.buffer)
    return 0


if __name__ == '__main__':
    if sys.argv[1:] != ['backup']:
        sys.exit('Usage: python ops.py backup > snapshot.sqlite3')
    sys.exit(backup())
