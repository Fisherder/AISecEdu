import datetime
import json
import os
import sys
import time
import uuid
from pathlib import Path


def main():
    assert os.environ.get('AISECEDU_ISOLATED_TEST') == 'agent-auto-20261023-r1'
    assert os.environ['DATABASE_URL'] == 'postgresql+psycopg2://agent_auto_test:isolated-auto-only@db/agent_auto_test'
    assert os.environ.get('REDIS_URL') == 'redis://cache:6379'
    assert os.environ.get('HOST_DATA_PATH') == '/isolated'
    sys.path.insert(0, '/opt/CTFd')
    from sqlalchemy import create_engine, text
    with create_engine(os.environ['DATABASE_URL']).begin() as connection:
        connection.execute(text('CREATE EXTENSION IF NOT EXISTS pgcrypto'))
    Path('/etc/docker').mkdir(parents=True, exist_ok=True)
    Path('/etc/docker/seccomp.json').write_text('{"syscalls":[]}')
    Path('/var/workspace_nodes.json').write_text('{}')
    Path('/var/user_firewall.allowed').write_text('')
    Path('/var/dojos').mkdir(parents=True, exist_ok=True)
    Path('/var/agent-runtime').mkdir(parents=True, exist_ok=True)
    os.environ['DOJO_AI_ENABLED'] = 'true'
    import CTFd
    from CTFd.config import TestingConfig

    class IsolatedConfig(TestingConfig):
        SQLALCHEMY_DATABASE_URI = os.environ['DATABASE_URL']
        SECRET_KEY = 'isolated-auto-platform-secret'
        CACHE_TYPE = 'SimpleCache'
        REDIS_URL = 'redis://cache:6379'
        SESSION_COOKIE_SECURE = False
        REVERSE_PROXY = False
        SAFE_MODE = False
        SERVER_NAME = None

    CTFd.update_check = lambda **kwargs: None
    app = CTFd.create_app(IsolatedConfig)
    if '--serve' in sys.argv:
        app.run(host='0.0.0.0', port=8000, threaded=True, use_reloader=False)
        return
    from CTFd.models import Users, db
    from CTFd.plugins.dojo_plugin.models import TeachingAgentMessages, TeachingAgentThreads, TeachingJobs, TeachingArtifacts, TeachingArtifactRevisions
    from CTFd.plugins.dojo_plugin.agent_runtime import jobs, model_inputs
    from CTFd.plugins.dojo_plugin.agent_runtime.conversation import turn_wait_state
    from CTFd.plugins.dojo_plugin.agent_runtime.workbench import require_execution_mode
    checks = []
    run_key = uuid.uuid4().hex
    with app.app_context():
        owner = Users.query.filter_by(name='admin').one()
        owner_id = owner.id
        stranger = Users.query.filter_by(name='workbench-stranger').first()
        if stranger is None:
            stranger = Users(name='workbench-stranger', email='stranger@isolated.invalid', password='test-only', type='admin')
            db.session.add(stranger)
        db.session.commit()
        stranger_id = stranger.id
    client = app.test_client()
    with client.session_transaction() as session:
        session['id'] = owner_id
        session['nonce'] = 'isolated-workbench-nonce'
    headers = {'CSRF-Token': 'isolated-workbench-nonce', 'Content-Type': 'application/json'}

    def request(method, endpoint, body=None, *, key=None, status=200):
        response = client.open('/pwncollege_api/v1/teaching' + endpoint, method=method, json=body,
                               headers={**headers, **({'Idempotency-Key': run_key + '-' + key} if key else {})})
        value = response.get_json()
        assert response.status_code == status, (endpoint, response.status_code, value)
        assert value['success'] == (status < 400), (endpoint, value)
        return value.get('data')

    checks = []
    thread = request('POST', '/threads', {'title': '自动识别与结构化澄清实机验收'}, status=201)['thread']

    def submit(prompt, **extra):
        data = request('POST', f'/threads/{thread["id"]}/messages', {'content': prompt, **extra}, key=uuid.uuid4().hex, status=202)
        with app.app_context():
            job = db.session.get(TeachingJobs, data['job']['id'])
            assert model_inputs.request_payload(job)['executionMode'] == 'auto'
        return data['job']['id']

    def complete(job_id):
        started = time.monotonic()
        with app.app_context():
            while time.monotonic() - started < 720:
                db.session.expire_all()
                root = db.session.get(TeachingJobs, job_id)
                end = jobs.execution_chain(db.session, root)
                pending = TeachingJobs.query.filter_by(owner_id=owner_id, thread_id=thread['id'], status='QUEUED').order_by(TeachingJobs.created).all()
                ready = next((job for job in pending if turn_wait_state(db.session, job) == 'ready'), None)
                if ready is not None:
                    jobs.process_job(ready.id, worker_id='auto-intent-isolated-live')
                    continue
                if end.status in {'SUCCEEDED', 'FAILED', 'CANCELED'}:
                    assert end.status == 'SUCCEEDED', (end.status, end.error)
                    break
                time.sleep(.3)
            else:
                raise AssertionError('Isolated model test deadline exceeded')
            message = TeachingAgentMessages.query.filter_by(thread_id=thread['id'], role='assistant').order_by(TeachingAgentMessages.id.desc()).first()
            assert message.metadata_json.get('pending') is False and not message.metadata_json.get('failed')
            meta = message.metadata_json
            row = {'id': message.id, 'content': message.content, 'metadata': dict(meta)}
            print(json.dumps({'step': len(checks)+1, 'seconds': round(time.monotonic()-started,2), 'intent': meta.get('intentDecision',{}).get('intent'), 'questions': [q['text'] for q in meta.get('questions',[])], 'files': [f['filename'] for f in meta.get('files',[])]}, ensure_ascii=False), flush=True)
            return row

    def answer(message, duration='三十'):
        brief=f'学生已经学过 Python，面向大一，{duration}分钟。无需真实数据库，以纸面代码阅读为主。三个问题在每个知识点讲完后即时作答，按识别、解释、应用递进；作答后立即给标准答案和明确反馈，教师版讲义在题后附答案。最终只交付可下载 Markdown 讲义。按已表达的任务继续。'
        return complete(submit(brief, questionReply={'sourceMessageId':message['id'], 'answers': {q['id']: brief for q in message['metadata']['questions']}}))

    if '--live' in sys.argv:
        plain = complete(submit('参数化查询为什么能减少 SQL 注入风险？请简短解释，不制作内容。'))
        assert plain['metadata']['executionMode'] == 'ask' and not plain['metadata'].get('questions') and not plain['metadata'].get('files')
        checks.append('自然语言知识问答自动只读回答')
        planned = complete(submit('先规划一节三十分钟的参数化查询防御课，让学生回答三个问题并得到明确反馈。最终讲义用 Markdown；本轮只规划。'))
        assert planned['metadata']['questions'] and not planned['metadata'].get('plan') and not planned['metadata'].get('files')
        checks.append('规划先提出结构化需求问题')
        planned = answer(planned)
        for _ in range(2):
            if not planned['metadata'].get('questions'): break
            planned = answer(planned)
        assert planned['metadata']['executionMode'] == 'plan' and len(planned['metadata'].get('plan',[])) >= 2 and not planned['metadata'].get('toolProposals') and not planned['metadata'].get('files'), planned
        checks.append('回答后形成同一任务的只读计划')
        revised = complete(submit('把刚才的计划改成十五分钟，保留全部三个问题及其反馈，本轮仍只调整计划。'))
        assert revised['metadata']['executionMode'] == 'plan' and not revised['metadata'].get('toolProposals') and not revised['metadata'].get('files') and not revised['metadata'].get('questions'), revised
        checks.append('对话修改未执行计划保持只读')
        made = complete(submit('按刚才十五分钟计划制作一份可下载的 Markdown 课堂讲义，保留三个问题及反馈，不创建平台课程或课件。'))
        for _ in range(2):
            if not made['metadata'].get('questions'): break
            made = answer(made, '十五')
        assert made['metadata']['executionMode'] == 'execute' and made['metadata'].get('files'), made
        checks.append('自然语言从计划转入创作并交付真实文件')
        files_before = made['metadata']['files']
        changed = complete(submit('保留刚才讲义第一和第三个问题，只把第二个问题改为对比两段参数化查询伪代码，给出更新后的可下载 Markdown 讲义。其余内容和十五分钟课时不变。'))
        assert changed['metadata']['executionMode'] == 'execute' and changed['metadata'].get('files') and not changed['metadata'].get('questions'), changed
        assert changed['metadata']['intentDecision']['intent'] == 'revise'
        checks.append('多轮自然语言修改已有文件并保留上下文')
        for index, message in enumerate([made, changed]):
            for file in message['metadata']['files']:
                response = client.get(file['downloadUrl'])
                assert response.status_code == 200 and len(response.data)>100
                output=Path('/var/agent-runtime/live-files'); output.mkdir(exist_ok=True)
                (output/f'lecture-{index+1}.md').write_bytes(response.data)
        Path('/var/agent-runtime/live-result.json').write_text(json.dumps({'passed':True,'checks':checks,'threadId':thread['id'],'runtimeImage':os.environ.get('AISECEDU_TEST_RUNTIME_IMAGE')},ensure_ascii=False,indent=2))
        print(json.dumps({'passed':True,'checks':checks,'threadId':thread['id'],'scope':'独立 PostgreSQL、Redis、CTFd、运行时及真实模型'},ensure_ascii=False),flush=True)
        return

    from CTFd.plugins.dojo_plugin.agent_runtime.workbench import project_mode_result
    job_id=submit('帮我规划课程')
    with app.app_context():
        job=db.session.get(TeachingJobs,job_id)
        q={'id':'audience','text':'学生基础？','choices':['学过 Python','尚未学过']}
        decision={'version':'teacher-intent-v1','intent':'plan','executionMode':'plan','request':'帮我规划课程','sourceRefs':[], 'clarification':{'state':'awaiting-input','summary':'先确认学生基础','round':1,'questions':[q]}}
        result=jobs._persist_result(job,{'answer':'先明确需求','executionMode':'plan','intentDecision':decision,'questions':[q],'plan':['不能泄漏的最终方案'],'toolProposals':[{'tool':'course.delete','arguments':{'dojoId':1}}],'deliverables':[{'format':'md','filename':'blocked.md','content':'blocked'}]})
        assert not result.get('plan') and not result.get('toolProposals') and not result.get('files')
        job.result=result;job.status='SUCCEEDED';db.session.commit()
        msg=TeachingAgentMessages.query.filter_by(thread_id=thread['id'],role='assistant').order_by(TeachingAgentMessages.id.desc()).first();source_id=msg.id
    if '--seed-ui' in sys.argv:
        Path('/var/agent-runtime/browser-seed.json').write_text(json.dumps({'threadId':thread['id'],'sourceMessageId':source_id}))
        print('Browser fixture ready',flush=True)
        return
    payload={'content':'学过 Python','questionReply':{'sourceMessageId':source_id,'answers':{'audience':'学过 Python'}}}
    reply=request('POST',f'/threads/{thread["id"]}/messages',payload,key='answer-once',status=202)['job']
    duplicate=request('POST',f'/threads/{thread["id"]}/messages',payload,key='answer-once',status=202)['job']
    assert reply['id']==duplicate['id']
    request('POST',f'/threads/{thread["id"]}/messages',payload,key='stale-answer',status=409)
    with app.app_context():
        bound=model_inputs.request_payload(db.session.get(TeachingJobs,reply['id']))
        assert bound['executionMode']=='auto' and bound['context']['questionReply']['originalRequest']=='帮我规划课程'
        assert bound['context']['questionReply']['answers'][0]['answer']=='学过 Python'
        db.session.get(TeachingJobs,reply['id']).status='CANCELED';db.session.commit()
    checks.append('结构化问题持久绑定、原文保留、幂等重试和过期回答拒绝')
    options_id=submit('按已经确认的需求准备三套参数化查询课件方案')
    with app.app_context():
        from CTFd.plugins.dojo_plugin.api.v1 import teaching as api
        options=[{'title':f'教学方案{i}', 'description':'通过明确的课堂活动组织案例、学生练习与教师反馈，逐步理解数据和查询结构的分离。', 'highlights':['对比案例','明确反馈'], 'rewrittenPrompt':f'采用第{i}套教学策略组织参数化查询防御课件。'+('学习目标是区分查询结构与用户数据，通过真实业务案例、三道理解检查、明确反馈和迁移练习完成十五分钟教学，保留教师指定的学习目标和验收方式。'*2)} for i in range(1,4)]
        job=db.session.get(TeachingJobs,options_id)
        confirmed={**decision,'intent':'create','executionMode':'execute','clarification':{**decision['clarification'],'state':'confirmed','questions':[]}}
        result=jobs._persist_result(job,{'answer':'三套方案供选择','executionMode':'execute','intentDecision':confirmed,'questions':[], 'generationOptions':{'targetTool':'candidate.generate','artifactType':'slide-deck','boundScope':None,'options':options}})
        assert result['generationOptions'] and len(result['generationOptions']['options'])==3
        job.result=result;job.status='SUCCEEDED';db.session.commit()
        source=TeachingAgentMessages.query.filter_by(thread_id=thread['id'],role='assistant').order_by(TeachingAgentMessages.id.desc()).first()
        args={'sourceMessageId':source.id,'optionId':'option-2'}
        first=api.start_teacher_generation(db.session.get(Users,owner_id),thread['id'],args,'natural-selection-'+run_key)
        value,status=first if isinstance(first,tuple) else (first,200)
        assert status==202 and value['success'],first
        child=value['data']['job']['id']
        second=api.start_teacher_generation(db.session.get(Users,owner_id),thread['id'],args,'natural-selection-'+run_key)
        duplicate,status=second if isinstance(second,tuple) else (second,200)
        assert status==202 and duplicate['data']['job']['id']==child
        generated=db.session.get(TeachingJobs,child)
        assert generated.kind=='candidate.generate' and generated.payload['prompt']==options[1]['rewrittenPrompt']
        generated.status='CANCELED';db.session.commit()
    checks.append('自然语言选定方案复用真实生成入口，准确采用原文且幂等重试不重复生成')
    with client.session_transaction() as session:session['id']=stranger_id
    request('GET',f'/threads/{thread["id"]}',status=404)
    checks.append('跨账号访问被拒绝')
    with client.session_transaction() as session:session['id']=owner_id
    page=client.get('/teacher?view=conversation')
    assert page.status_code==200 and b'cocreation-workbench' in page.data
    print(json.dumps({'passed':True,'checks':checks,'threadId':thread['id'],'modelCalls':0,'productionChanges':0},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    main()
