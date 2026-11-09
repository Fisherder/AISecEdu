import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch


root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('homefs_bootstrap', root / 'ops/homefs-bootstrap.py')
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class HomefsBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        with sqlite3.connect(self.root / 'homefs.db') as database:
            database.execute('CREATE TABLE docker_volumes (name TEXT PRIMARY KEY, overlay TEXT)')
            database.executemany('INSERT INTO docker_volumes VALUES (?,?)', [('101', None), ('101-overlay', '101')])
        self.patch = patch.object(bootstrap, 'ROOT', self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_existing_base_volume_is_restored_from_real_metadata(self):
        status, body = bootstrap.response('/VolumeDriver.Get', {'Name': '101'})
        self.assertEqual(status, 200)
        self.assertEqual(body['Volume']['Mountpoint'], str(self.root / '101/active'))

    def test_overlay_keeps_its_owner_mapping(self):
        status, body = bootstrap.response('/VolumeDriver.Get', {'Name': '101-overlay'})
        self.assertEqual(status, 200)
        self.assertEqual(body['Volume']['Mountpoint'], str(self.root / '101/overlays/101-overlay'))

    def test_unknown_volume_is_not_invented(self):
        self.assertEqual(bootstrap.response('/VolumeDriver.Get', {'Name': 'missing'})[0], 404)

    def test_bootstrap_rejects_mutation_requests(self):
        before = (self.root / 'homefs.db').read_bytes()
        for endpoint in ['Create', 'Remove', 'Mount', 'Unmount']:
            self.assertEqual(bootstrap.response('/VolumeDriver.' + endpoint, {'Name': '101'})[0], 503)
        self.assertEqual(before, (self.root / 'homefs.db').read_bytes())

    def test_volume_names_cannot_escape_storage(self):
        for name in ['..', '../other', '/tmp/other', '.']:
            with self.assertRaises(ValueError):
                bootstrap.mountpoint(name, None)


if __name__ == '__main__':
    unittest.main()
