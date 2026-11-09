import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit

import pytest

from app_test_layout import application_nodes, load_manifest


ROOT = Path(__file__).resolve().parents[2]


def main():
    if os.environ.get('DOJO_ENV') != 'coverage':
        raise RuntimeError('Application test runner only accepts an isolated coverage environment')
    settings = json.load(sys.stdin)
    url = settings.get('http_url', 'http://nginx')
    if urlsplit(url).hostname not in {'nginx', 'localhost', '127.0.0.1', 'ci-app'}:
        raise ValueError('Application test HTTP endpoint must remain in the isolated test network')
    os.environ.update(DOJO_CONTAINER='dojo', DOJO_IP=urlsplit(url).hostname, DOJO_URL=url,
                      DOJO_HTTP_HOST=os.environ.get('DOJO_HOST', 'localhost.pwn.college'),
                      DOJO_ADMIN_USERNAME=settings.get('admin_username', 'admin'),
                      DOJO_ADMIN_PASSWORD=settings['admin_password'],
                      DOJO_TEST_ALLOW_HTTP_SECURE_COOKIE='1', AISECEDU_SPLIT_APP_TESTS='')
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(ROOT / 'test'))
    sys.path.insert(0, '/opt/CTFd')
    from CTFd import create_app
    from CTFd.models import db
    from sqlalchemy import text

    app = create_app()
    with app.test_request_context('/'):
        for name, module in list(sys.modules.items()):
            if name == 'CTFd.plugins.dojo_plugin' or name.startswith('CTFd.plugins.dojo_plugin.'):
                sys.modules[name.removeprefix('CTFd.plugins.')] = module
        import utils

        def app_db_sql(sql):
            result = db.session.execute(text(sql))
            rows = result.fetchall() if result.returns_rows else []
            output = '\n'.join('|'.join('' if value is None else str(value) for value in row) for row in rows)
            db.session.commit()
            return output + ('\n' if rows else '')

        utils.db_sql = app_db_sql

        class ContextPlugin:
            @pytest.fixture(autouse=True)
            def isolated_request(self):
                with app.test_request_context('/'):
                    yield
                    db.session.rollback()
                    db.session.remove()

        return pytest.main([
            '--rootdir=' + str(ROOT / 'test'), '--confcutdir=' + str(ROOT / 'test'),
            '-v', '--color=no', *application_nodes(load_manifest(ROOT), ROOT),
        ], plugins=[ContextPlugin()])


if __name__ == '__main__':
    raise SystemExit(main())
