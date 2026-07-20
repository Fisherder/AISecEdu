import pathlib

from CTFd.models import Users, db


password = pathlib.Path("/var/uploads/.admin-password").read_text().strip()
admin = Users.query.filter_by(name="admin", type="admin").one()
admin.password = password
db.session.commit()
