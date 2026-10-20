"""Verify .env interpolation without starting containers or reading local config."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(shutil.which('docker'), 'Docker CLI required for Compose config checks')
class ComposeSettingsTests(unittest.TestCase):
    def config(self, content):
        env = dict(os.environ)
        for name in ('FLESH_BIND', 'FLESH_PORT', 'FLESH_ALLOW_REGISTRATION', 'APP_ORIGIN'):
            env.pop(name, None)
        with tempfile.NamedTemporaryFile(mode='w', suffix='.env') as settings:
            settings.write(content)
            settings.flush()
            raw = subprocess.check_output(['docker', 'compose', '--env-file', settings.name, 'config', '--format', 'json'], cwd=ROOT, env=env, text=True)
        return json.loads(raw)['services']['health']

    def test_existing_configuration_without_new_settings_keeps_defaults(self):
        service = self.config('')
        self.assertEqual(service['ports'][0]['host_ip'], '127.0.0.1')
        self.assertEqual(service['ports'][0]['published'], '8083')
        self.assertEqual(service['ports'][0]['target'], 8080)
        self.assertEqual(service['environment']['APP_ORIGIN'], 'http://localhost:8083')
        self.assertEqual(service['environment']['FLESH_ALLOW_REGISTRATION'], 'false')

    def test_custom_host_port_updates_local_origin_and_keeps_internal_port(self):
        service = self.config('FLESH_BIND=0.0.0.0\nFLESH_PORT=18084\n')
        self.assertEqual(service['ports'][0]['host_ip'], '0.0.0.0')
        self.assertEqual(service['ports'][0]['published'], '18084')
        self.assertEqual(service['ports'][0]['target'], 8080)
        self.assertEqual(service['environment']['APP_ORIGIN'], 'http://localhost:18084')

    def test_public_origin_and_registration_opt_in_are_preserved(self):
        service = self.config('FLESH_PORT=18084\nAPP_ORIGIN=https://flesh.example.org\nFLESH_ALLOW_REGISTRATION=true\n')
        self.assertEqual(service['environment']['APP_ORIGIN'], 'https://flesh.example.org')
        self.assertEqual(service['environment']['FLESH_ALLOW_REGISTRATION'], 'true')


if __name__ == '__main__':
    unittest.main()
