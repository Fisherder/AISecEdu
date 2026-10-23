from CTFd import create_app

app = create_app()
with app.app_context():
    from CTFd.models import Users
    from CTFd.plugins.dojo_plugin.library_sources import library_courses, list_sources
    from CTFd.plugins.dojo_plugin.models import Dojos
    from CTFd.plugins.dojo_plugin.models.construction import ConstructionSpaces

    frozen = {row.course_id for row in ConstructionSpaces.query.all()}
    print('frozen review spaces:', sorted(frozen))

    for name in ('build-peer', 'build-author', 'build-lead'):
        user = Users.query.filter_by(name=name).one()
        courses = library_courses(user)
        ids = {c['id'] for c in courses}
        leaked = ids & frozen
        print(f'{name}: courses={len(courses)} leaked_frozen={sorted(leaked)}')
        assert not leaked, f'{name} still sees frozen review spaces'
        assert courses, f'{name} lost all courses'
        for kind in ('artifact', 'practice', 'assignment'):
            rows = list_sources(user, kind=kind, limit=100)['sources']
            bad = [r for r in rows if r.get('courseId') in frozen]
            print(f'  {name} {kind}: {len(rows)} sources, frozen={len(bad)}')
            assert not bad, f'{name} sees frozen {kind} sources'

    peer = Users.query.filter_by(name='build-peer').one()
    practice = list_sources(peer, kind='practice', limit=100)['sources']
    print('peer practice sources:', [(r['id'], r['title']) for r in practice])
    assert practice, 'peer lost the imported practice draft'

    admin = Users.query.filter_by(id=1).one()
    admin_courses = library_courses(admin)
    print('admin courses:', len(admin_courses), 'frozen leaked:', sorted({c["id"] for c in admin_courses} & frozen))

    print('OK: frozen review copies are hidden from library courses and sources')
