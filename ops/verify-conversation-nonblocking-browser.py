#!/usr/bin/env python3
"""Exercise staged attachments and a real conversation send in production Chromium.

Run on the deployment host. All created records belong to a unique QA thread and
are removed after the browser assertion. No credentials are printed.
"""

import datetime
import hashlib
import json
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import time
import uuid

import requests


ORIGIN = "http://10.92.35.7:8080"
RUN_ID = uuid.uuid4().hex[:12]
SIMULATE_PENDING_INDEX = os.environ.get("QA_SIMULATE_PENDING_INDEX") == "1"
PPT_SOURCE = os.environ.get("QA_PPT_SOURCE")
PPT_MIN_INDEX_CHARS = int(os.environ.get("QA_PPT_MIN_INDEX_CHARS", "5000"))
PPT_EXPECT_MARKER = os.environ.get("QA_PPT_EXPECT_MARKER", "")
PPT_EXPECT_INDEX_MODE = os.environ.get("QA_PPT_EXPECT_INDEX_MODE", "")
PPT_INDEX_WAIT_SECONDS = int(os.environ.get("QA_PPT_INDEX_WAIT_SECONDS", "100"))
STARTED = datetime.datetime.utcnow()
FIXTURES = [
    pathlib.Path("/tmp") / f"qa-nonblocking-{RUN_ID}-{n}{pathlib.Path(PPT_SOURCE).suffix.lower() if n == 1 and PPT_SOURCE else '.md'}"
    for n in (1, 2)
]
for number, file in enumerate(FIXTURES, 1):
    if number == 1 and PPT_SOURCE:
        shutil.copyfile(PPT_SOURCE, file)
    else:
        file.write_text(
            f"# QA 附件 {RUN_ID}-{number}\n\n这是独立浏览器验收资料，不属于课程内容。\n",
            encoding="utf-8",
        )
DIGESTS = [hashlib.sha256(file.read_bytes()).hexdigest() for file in FIXTURES]


def ctfd(source, timeout=120):
    completed = subprocess.run(
        ["docker", "exec", "-i", "pwncollege-dojo", "docker", "exec", "-i", "ctfd", "python", "-"],
        input=source,
        text=True,
        capture_output=True,
        timeout=timeout,
    )
    if completed.returncode:
        raise RuntimeError((completed.stderr + completed.stdout)[-3000:])
    return completed.stdout


def marker(source, name):
    return next(line[len(name) + 1 :] for line in source.splitlines() if line.startswith(name + "="))


setup = ctfd(
    """import uuid
from CTFd import create_app
app=create_app()
with app.app_context():
 from CTFd.models import Users,db
 from CTFd.plugins.dojo_plugin.models import TeachingAgentThreads
 user=Users.query.filter_by(name='build-cade-c').one()
 thread=TeachingAgentThreads(user_id=user.id,title='QA非阻塞附件验收-'+uuid.uuid4().hex[:8],phase='COURSE_SETUP',context={})
 db.session.add(thread);db.session.commit()
 client=app.test_client()
 with client.session_transaction() as session:
  session.update(id=user.id,name=user.name,type=user.type,nonce='qa-browser-nonce')
 cookie=next(item for item in client._cookies.values() if item.key=='aisecedu-vpn-session')
 print('COOKIE='+cookie.value)
 print('THREAD='+thread.id)
 print('OWNER='+str(user.id))
"""
)
cookie = marker(setup, "COOKIE")
thread_id = marker(setup, "THREAD")
owner_id = int(marker(setup, "OWNER"))

with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
profile = tempfile.TemporaryDirectory(prefix="aisecedu-nonblocking-browser-")
driver = subprocess.Popen(
    ["/usr/bin/chromedriver", f"--port={port}", "--allowed-ips="],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
session_id = None


def wd(method, path, payload=None):
    response = requests.request(
        method,
        f"http://127.0.0.1:{port}" + path,
        json=payload,
        timeout=30,
    )
    result = response.json().get("value")
    if response.status_code >= 400 or (isinstance(result, dict) and result.get("error")):
        raise RuntimeError(f"WebDriver {method} {path}: {str(result)[:1200]}")
    return result


try:
    for _ in range(100):
        try:
            if requests.get(f"http://127.0.0.1:{port}/status", timeout=1).ok:
                break
        except requests.RequestException:
            time.sleep(0.2)
    else:
        raise RuntimeError("ChromeDriver did not start")
    session_id = wd("POST", "/session", {"capabilities": {"alwaysMatch": {
        "browserName": "chrome",
        "goog:chromeOptions": {"binary": "/usr/bin/chromium-browser", "args": [
            "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
            "--no-proxy-server", f"--user-data-dir={profile.name}", "--window-size=1440,1000",
        ]},
    }}})["sessionId"]
    path = f"/session/{session_id}"
    wd("POST", path + "/url", {"url": ORIGIN + "/login"})
    wd("POST", path + "/cookie", {"cookie": {
        "name": "aisecedu-vpn-session", "value": cookie, "path": "/",
    }})
    cookie = ""
    wd("POST", path + "/url", {"url": ORIGIN + "/teacher?thread=" + thread_id})

    def js(source):
        return wd("POST", path + "/execute/sync", {"script": source, "args": []})

    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        if js("return !!document.querySelector('#teaching-upload') && document.querySelector('#teacher-agent')?.dataset.ready === 'true'"):
            break
        time.sleep(0.5)
    else:
        raise RuntimeError("composer did not initialize: " + str(js("return {url:location.href,body:document.body.innerText.slice(0,500)}")))
    version = js("return document.querySelector('script[src*=\"teaching-agent.min.js\"]')?.src")
    if not version or "v8-job-events" not in version:
        raise RuntimeError("unexpected browser script: " + str(version))

    element = wd("POST", path + "/element", {"using": "css selector", "value": "#teaching-upload"})
    element_id = element["element-6066-11e4-a52e-4f735466cecf"]
    files = "\n".join(str(file) for file in FIXTURES)
    wd("POST", path + "/element/" + element_id + "/value", {"text": files, "value": [files]})
    deadline = time.monotonic() + 70
    while time.monotonic() < deadline:
        state = js("return Array.from(document.querySelectorAll('#teaching-upload-status .teaching-upload-draft-item')).map(x=>({text:x.innerText,ready:x.classList.contains('is-ready'),error:x.classList.contains('is-upload-error')}))")
        if len(state) == 2 and all(item["ready"] for item in state):
            break
        if any(item["error"] for item in state):
            raise RuntimeError("upload failed: " + json.dumps(state, ensure_ascii=False))
        time.sleep(0.3)
    else:
        raise RuntimeError("upload timed out: " + json.dumps(state, ensure_ascii=False))

    if SIMULATE_PENDING_INDEX:
        pending = ctfd(
            """import json,uuid
from CTFd import create_app
app=create_app()
with app.app_context():
 from CTFd.models import db
 from CTFd.plugins.dojo_plugin.models import TeachingJobs,TeachingMaterials,TeachingMaterialRevisions
 material=TeachingMaterials.query.filter_by(owner_id=OWNER,sha256=DIGEST).one()
 revision=TeachingMaterialRevisions.query.filter_by(material_id=material.id).order_by(TeachingMaterialRevisions.revision.desc()).first()
 assert revision is not None
 material.status='UPLOADED'
 revision.status='PENDING'
 job=TeachingJobs(owner_id=OWNER,kind='material.analyze',status='QUEUED',stage='queued',priority=20,
                  idempotency_key='qa-pending-index-'+uuid.uuid4().hex,
                  payload={'materialId':material.id,'revisionId':revision.id,'taskListHidden':True,'qaSyntheticPendingIndex':True})
 db.session.add(job);db.session.commit()
 print('PENDING='+json.dumps({'jobId':job.id,'materialId':material.id}))
""".replace("OWNER", repr(owner_id)).replace("DIGEST", repr(DIGESTS[0])),
        )
        pending_index_job = json.loads(marker(pending, "PENDING"))["jobId"]
    else:
        pending_index_job = None

    js("""window.__qaSend=[];
      for (const host of [window,window.CTFd]) {
        if (!host || typeof host.fetch !== 'function') continue;
        const original=host.fetch;
        host.fetch=async function(url,options) {
          const response=await original.apply(this,arguments);
          if (String(url).includes('/teaching/threads/') && String(url).includes('/messages') &&
              String(options?.method||'').toUpperCase()==='POST') {
            let body={};try{body=JSON.parse(options.body)}catch(e){}
            window.__qaSend.push({status:response.status,sourceRefs:body.sourceRefs||[],delivery:body.delivery||null});
          }
          return response;
        };
      }
    """)
    js("""const box=document.querySelector('#teaching-input');
      box.value='请确认收到本次上传的两份测试资料，不要生成课件。';
      box.dispatchEvent(new Event('input',{bubbles:true}));
      return {enabled:!document.querySelector('#teaching-send').disabled};
    """)
    if not js("return !document.querySelector('#teaching-send').disabled"):
        raise RuntimeError("send button remained disabled after upload was saved")
    click_at = time.monotonic()
    js("document.querySelector('#teaching-send').click(); return true")
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        posts = js("return window.__qaSend||[]")
        if posts:
            break
        time.sleep(0.2)
    else:
        raise RuntimeError("browser did not submit a message within 20 seconds")
    accepted = next((item for item in posts if item["status"] == 202), None)
    if accepted is None:
        raise RuntimeError("message request was not accepted: " + json.dumps(posts))
    send_accepted_seconds = round(time.monotonic() - click_at, 2)
    if len(accepted["sourceRefs"]) != 2:
        raise RuntimeError("message did not carry both explicitly staged files: " + json.dumps(accepted))

    inspection = ctfd(
        """import json
from CTFd import create_app
app=create_app()
with app.app_context():
 from CTFd.plugins.dojo_plugin.models import TeachingMaterials,TeachingJobs,TeachingAgentMessages
 mats=TeachingMaterials.query.filter(TeachingMaterials.owner_id==OWNER,TeachingMaterials.sha256.in_(DIGESTS)).all()
 jobs=TeachingJobs.query.filter(TeachingJobs.owner_id==OWNER,TeachingJobs.thread_id==THREAD).all()
 index_jobs=[j for j in TeachingJobs.query.filter_by(owner_id=OWNER,kind='material.analyze').all() if (j.payload or {}).get('materialId') in [m.id for m in mats]]
 messages=TeachingAgentMessages.query.filter_by(thread_id=THREAD,role='user').all()
 print('INSPECT='+json.dumps({'materialIds':[m.id for m in mats], 'materialStatuses':[m.status for m in mats], 'materialsBySha':{m.sha256:{'id':m.id,'status':m.status} for m in mats}, 'indexJobs':[{'id':j.id,'materialId':(j.payload or {}).get('materialId'),'status':j.status} for j in index_jobs], 'jobs':[{'kind':j.kind,'status':j.status,'dependsOnJobIds':(j.payload or {}).get('dependsOnJobIds',[]),'sourceRefs':(j.payload or {}).get('sourceRefs',[])} for j in jobs], 'userMessages':len(messages)},ensure_ascii=False))
""".replace("OWNER", repr(owner_id)).replace("THREAD", repr(thread_id)).replace("DIGESTS", repr(DIGESTS)),
    )
    observed = json.loads(marker(inspection, "INSPECT"))
    assert len(observed["materialIds"]) == 2, observed
    assert observed["userMessages"] == 1, observed
    assert any(job["kind"] == "agent.chat" for job in observed["jobs"]), observed
    assert {ref["id"] for ref in accepted["sourceRefs"]} == set(observed["materialIds"])
    if pending_index_job and not any(
        pending_index_job in job["dependsOnJobIds"]
        for job in observed["jobs"] if job["kind"] == "agent.chat"
    ):
        raise RuntimeError("send did not preserve pending-index dependency: " + json.dumps(observed))
    if PPT_SOURCE:
        ppt = observed["materialsBySha"][DIGESTS[0]]
        ppt_jobs = [job for job in observed["indexJobs"] if job["materialId"] == ppt["id"]]
        assert len(ppt_jobs) == 1, observed
        if ppt["status"] != "UPLOADED":
            raise RuntimeError("real PPT finished indexing before nonblocking send could be observed: " + json.dumps(observed))
        if not any(ppt_jobs[0]["id"] in job["dependsOnJobIds"] for job in observed["jobs"] if job["kind"] == "agent.chat"):
            raise RuntimeError("real PPT dependency was lost: " + json.dumps(observed))
    prior_posts = len(posts)
    js("""const box=document.querySelector('#teaching-input');
      box.value='请根据这份课件出题';
      box.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    """)
    if not js("return !document.querySelector('#teaching-send').disabled"):
        raise RuntimeError("composer cannot accept a follow-up while the first turn runs")
    js("document.querySelector('#teaching-send').click(); return true")
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        followup_posts = js("return window.__qaSend||[]")[prior_posts:]
        if followup_posts:
            break
        time.sleep(0.2)
    else:
        raise RuntimeError("follow-up request was not submitted")
    if not any(item["status"] == 400 and not item["sourceRefs"] for item in followup_posts):
        raise RuntimeError("unspecified single-file request unexpectedly accepted: " + json.dumps(followup_posts))
    ppt_index_characters = None
    if PPT_SOURCE:
        completion = ctfd(
            """import json,time
from CTFd import create_app
app=create_app()
with app.app_context():
 from CTFd.models import db
 from CTFd.plugins.dojo_plugin.models import TeachingMaterials,TeachingMaterialRevisions,TeachingMaterialChunks,TeachingJobs,ModelInvocations
 deadline=time.monotonic()+INDEX_WAIT
 while time.monotonic()<deadline:
  db.session.expire_all()
  material=TeachingMaterials.query.filter_by(owner_id=OWNER,sha256=DIGEST).one()
  revision=TeachingMaterialRevisions.query.filter_by(material_id=material.id).order_by(TeachingMaterialRevisions.revision.desc()).first()
  if revision and revision.status in {'READY','FAILED'}:
   chunks=TeachingMaterialChunks.query.filter_by(revision_id=revision.id).all()
   characters=sum(len(chunk.content or '') for chunk in chunks)
   index_job=next((j for j in TeachingJobs.query.filter_by(owner_id=OWNER,kind='material.analyze').all() if (j.payload or {}).get('revisionId')==revision.id),None)
   invocation=ModelInvocations.query.filter_by(job_id=index_job.id,status='SUCCEEDED').first() if index_job else None
   mode=(invocation.parameters or {}).get('executionMode') if invocation else None
   print('PPT_INDEX='+json.dumps({'status':revision.status,'characters':characters,'markerPresent':MARKER in ''.join(chunk.content or '' for chunk in chunks),'executionMode':mode}))
   break
  time.sleep(1)
 else: print('PPT_INDEX='+json.dumps({'status':'TIMEOUT','characters':0}))
""".replace("OWNER", repr(owner_id)).replace("DIGEST", repr(DIGESTS[0])).replace("MARKER", repr(PPT_EXPECT_MARKER)).replace("INDEX_WAIT", repr(PPT_INDEX_WAIT_SECONDS)),
            timeout=PPT_INDEX_WAIT_SECONDS + 20,
        )
        indexed = json.loads(marker(completion, "PPT_INDEX"))
        if (indexed["status"] != "READY" or indexed["characters"] < PPT_MIN_INDEX_CHARS
                or not indexed["markerPresent"] or (PPT_EXPECT_INDEX_MODE and indexed["executionMode"] != PPT_EXPECT_INDEX_MODE)):
            raise RuntimeError("real PPT source index did not become usable: " + json.dumps(indexed))
        ppt_index_characters = indexed["characters"]
    print("BROWSER_RESULT=" + json.dumps({
        "passed": True,
        "uploadCount": 2,
        "sendAcceptedWithinSeconds": send_accepted_seconds,
        "unselectedSingleFileRejected": True,
        "pendingIndexDependencyVerified": bool(pending_index_job or PPT_SOURCE),
        "realPptIndexedCharacters": ppt_index_characters,
        "realPptIndexMode": indexed["executionMode"] if PPT_SOURCE else None,
        "materialStatusesAtInspection": observed["materialStatuses"],
        "jobKindsAtInspection": [job["kind"] for job in observed["jobs"]],
        "agentDependenciesAtInspection": [job["dependsOnJobIds"] for job in observed["jobs"] if job["kind"] == "agent.chat"],
    }, ensure_ascii=False))
finally:
    if session_id:
        try:
            wd("DELETE", f"/session/{session_id}")
        except Exception:
            pass
    driver.terminate()
    driver.wait(timeout=5)
    profile.cleanup()
    for fixture in FIXTURES:
        fixture.unlink(missing_ok=True)
    cleanup = ctfd(
        """import json,pathlib,time
from CTFd import create_app
app=create_app()
with app.app_context():
 from CTFd.models import db
 from CTFd.plugins.dojo_plugin.models import TeachingAgentThreads,TeachingJobs,TeachingMaterials
 from CTFd.plugins.dojo_plugin import config
 from CTFd.plugins.dojo_plugin.agent_runtime.jobs import cancel_job
 mats=TeachingMaterials.query.filter(TeachingMaterials.owner_id==OWNER,TeachingMaterials.sha256.in_(DIGESTS)).all()
 ids=[m.id for m in mats]
 paths=[pathlib.Path(config.AGENT_RUNTIME_STORAGE_ROOT)/m.storage_key for m in mats]
 jobs=[j for j in TeachingJobs.query.filter_by(owner_id=OWNER).all() if j.thread_id==THREAD or (j.payload or {}).get('materialId') in ids]
 for job in jobs:
  if job.status in {'QUEUED','RUNNING','CANCEL_REQUESTED'}:cancel_job(job,OWNER)
 deadline=time.monotonic()+90
 while time.monotonic()<deadline:
  db.session.expire_all()
  live=TeachingJobs.query.filter(TeachingJobs.id.in_([j.id for j in jobs]),TeachingJobs.status.in_(['QUEUED','RUNNING','CANCEL_REQUESTED'])).count() if jobs else 0
  if not live:break
  time.sleep(1)
 db.session.expire_all()
 active=[j.id for j in jobs if TeachingJobs.query.get(j.id) and TeachingJobs.query.get(j.id).status in {'QUEUED','RUNNING','CANCEL_REQUESTED'}]
 if active:
  print('CLEANUP_PENDING='+json.dumps(active))
 else:
  if jobs:TeachingJobs.query.filter(TeachingJobs.id.in_([j.id for j in jobs])).delete(synchronize_session=False)
  thread=TeachingAgentThreads.query.filter_by(id=THREAD,user_id=OWNER).first()
  if thread:db.session.delete(thread)
  if ids:TeachingMaterials.query.filter(TeachingMaterials.id.in_(ids)).delete(synchronize_session=False)
  db.session.commit()
  for file in paths:file.unlink(missing_ok=True)
  print('CLEANUP='+json.dumps({'materials':len(ids),'jobs':len(jobs),'thread':THREAD}))
""".replace("OWNER", repr(owner_id)).replace("THREAD", repr(thread_id)).replace("DIGESTS", repr(DIGESTS)),
        timeout=120,
    )
    print(next((line for line in cleanup.splitlines() if line.startswith("CLEANUP")), "CLEANUP=UNKNOWN"))
