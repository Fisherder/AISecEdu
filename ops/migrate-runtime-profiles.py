import argparse
import json
import sys

sys.path.insert(0, "/opt/CTFd")

from CTFd import create_app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    options = parser.parse_args()
    app = create_app()
    with app.app_context():
        import docker
        from CTFd.models import db
        from CTFd.plugins.dojo_plugin.models import DojoChallenges

        client = docker.from_env()
        images = {}
        updated = []
        for challenge in DojoChallenges.query.all():
            data = challenge.data or {}
            if data.get("runtime_environment") or not data.get("image"):
                continue
            image_name = data["image"]
            if image_name not in images:
                try:
                    image = client.images.get(image_name)
                    images[image_name] = (image.attrs.get("Config", {}).get("Labels") or {}).get("org.aisecedu.runtime")
                except docker.errors.ImageNotFound:
                    images[image_name] = None
            if images[image_name] != "windows-qemu":
                continue
            updated.append({"course": challenge.dojo.reference_id, "challenge": challenge.id, "environment": "windows", "image": image_name})
            if options.apply:
                challenge.data = {**data, "runtime_environment": "windows"}
        if options.apply:
            db.session.commit()
        print(json.dumps({"applied": options.apply, "updated": updated}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
