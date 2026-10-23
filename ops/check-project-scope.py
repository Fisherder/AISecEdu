import sys

from CTFd import create_app

app = create_app()
with app.app_context():
    from CTFd.plugins.dojo_plugin.agent_runtime.jobs import validated_generation_options
    from CTFd.plugins.dojo_plugin.models.global_agent import TeachingAgentMessages, TeachingJobs

    job = TeachingJobs.query.filter_by(id=sys.argv[1], kind="agent.chat").one()
    message = next(row for row in TeachingAgentMessages.query.filter_by(thread_id=job.thread_id, role="assistant").order_by(TeachingAgentMessages.id.desc()).all() if (row.metadata_json or {}).get("generationOptions"))
    source = dict(message.metadata_json["generationOptions"])
    source.pop("boundScope", None)
    first = validated_generation_options(job, {"generationOptions": source})
    assert first["boundScope"] == {"dojoId": None, "moduleIndex": None, "collection": "projects"}
    assert validated_generation_options(job, {"generationOptions": first}) == first
    for scope in ({}, {"collection": "projects", "dojoId": 1}, {"collection": "projects", "moduleIndex": 0}):
        assert validated_generation_options(job, {"generationOptions": {**source, "boundScope": scope}}) is None
    assert validated_generation_options(job, {"generationOptions": {**source, "targetTool": "challenge.generate", "artifactType": "ctf-challenge"}}) is None
    print("PASS: independent scope survives selection revalidation; malformed scopes and unscoped challenges rejected")
