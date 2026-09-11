from types import SimpleNamespace

import pytest
import requests
from sqlalchemy.orm.exc import DetachedInstanceError


@pytest.mark.parametrize('status', [401, 402, 403])
def test_model_account_errors_are_not_retried(monkeypatch, status):
    from CTFd.plugins.dojo_plugin.learning import intelligence, solution_agent

    response = requests.Response()
    response.status_code = status
    calls = []

    def post(*args, **kwargs):
        calls.append(kwargs)
        return response

    monkeypatch.setattr(intelligence, 'DOJO_AI_ENABLED', True)
    monkeypatch.setattr(intelligence, 'DOJO_AI_API_KEY', 'test-key')
    monkeypatch.setattr(intelligence.requests, 'post', post)
    with pytest.raises(RuntimeError, match=f'HTTP {status}') as error:
        solution_agent._solution_model_json('Return JSON', {}, model='test-model', attempts=3)
    assert not isinstance(error.value, solution_agent.SolutionModelError)
    assert len(calls) == 1


@pytest.mark.parametrize('retryable', [False, True])
def test_solution_failure_survives_detached_queue_record(monkeypatch, retryable):
    from CTFd.plugins.dojo_plugin import models
    from CTFd.plugins.dojo_plugin.agent_runtime import jobs
    from CTFd.plugins.dojo_plugin.learning import solution_agent

    class Job(SimpleNamespace):
        def __getattribute__(self, name):
            if name in {'attempt_count', 'max_attempts'} and self.detached:
                raise DetachedInstanceError('Native runner removed its session')
            return super().__getattribute__(name)

    job = Job(kind='learning.solution', payload={'solutionRunId': 'test-run'}, attempt_count=1, max_attempts=3, detached=False)
    run = SimpleNamespace(id='test-run', status='FAILED', error='provider unavailable', verification={'retryable': retryable}, phase='failed', progress=12, completed=object())
    query = SimpleNamespace(filter_by=lambda **kwargs: SimpleNamespace(first=lambda: run))
    monkeypatch.setattr(models, 'LearningSolutionRuns', SimpleNamespace(query=query))
    monkeypatch.setattr(jobs, 'db', SimpleNamespace(session=SimpleNamespace(commit=lambda: None)))
    monkeypatch.setattr(solution_agent, '_run_solution_agent', lambda *args: setattr(job, 'detached', True))
    expected = jobs.RetryableJobError if retryable else jobs.PermanentJobError
    with pytest.raises(expected, match='provider unavailable'):
        jobs._execute_local_job(job)
