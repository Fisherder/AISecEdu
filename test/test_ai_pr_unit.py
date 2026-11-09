import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('ai_pr', ROOT / 'ops/team/ai_pr.py')
ai = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ai)


def report():
    return {'summary': '合成审查结果', 'requires_human': False, 'human_reason': '', 'findings': []}


def rejects(callback):
    try:
        callback()
    except ValueError:
        return
    raise AssertionError('Expected rejection')


def test_reports_reject_partial_output_and_ambiguous_types():
    for mutate in (lambda row: row.pop('findings'), lambda row: row.update(requires_human='false'),
                   lambda row: row.update(summary=None), lambda row: row.update(findings={})):
        value = report()
        mutate(value)
        rejects(lambda: ai.validate_report(value))
    finding = {'priority': 2, 'file': 'dojo_plugin/courseware_quiz.py', 'line': 55, 'message': '合成问题'}
    for field, value in (('priority', True), ('priority', 4), ('line', 0), ('file', '../secret'), ('file', '/etc/passwd')):
        row = report()
        row['findings'] = [{**finding, field: value}]
        rejects(lambda: ai.validate_report(row))
    valid = report()
    valid['findings'] = [finding]
    assert ai.validate_report(valid) is valid


def test_sensitive_and_large_changes_require_maintainer_review():
    for path in ('.github/workflows/check.yml', 'AGENTS.md', 'ops/team/ai_pr.py',
                 'dojo_plugin/api/v1/teaching.py', 'dojo_plugin/models/teaching.py',
                 'dojo_plugin/coursework.py', 'dojo_plugin/agent_runtime/tool_executor.py',
                 'dojo_plugin/authoring_standards/global.md', 'docker-compose.yml'):
        assert ai.manual_reasons([path], 1, 0), path
    assert not ai.manual_reasons(['dojo_plugin/courseware_quiz.py', 'test/test_example_unit.py'], 100, 1)
    assert ai.manual_reasons(['dojo_theme/templates/example.html'], 1501, 0)


def test_only_latest_required_check_results_affect_failure_context():
    checks = [
        {'name': 'audit', 'id': 1, 'conclusion': 'failure'},
        {'name': 'audit', 'id': 2, 'conclusion': 'success'},
        {'name': 'contributor-checks', 'id': 3, 'conclusion': 'failure'},
        {'name': ai.CHECK, 'id': 4, 'conclusion': 'failure'},
        {'name': 'optional-external-review', 'id': 5, 'conclusion': 'failure'},
    ]
    assert [row['id'] for row in ai.failed_checks(checks)] == [3]


def test_repair_rounds_survive_automatic_base_sync_and_reset_on_human_commit():
    human = {'commit': {'message': 'human feature', 'author': {'name': 'member'}}, 'parents': [{}]}
    fixed = {'commit': {'message': ai.AUTO_COMMIT + 'round 1', 'author': {'name': 'github-actions[bot]'}}, 'parents': [{}]}
    synced = {'commit': {'message': 'Merge current develop', 'author': {'name': 'github-actions[bot]'}}, 'parents': [{}, {}]}
    assert ai.auto_rounds([human, fixed, synced, fixed]) == 2
    assert ai.auto_rounds([fixed, human]) == 0


def test_cache_requires_bot_identity_exact_head_and_valid_report():
    context = {'head': 'a' * 40, 'model': 'synthetic', 'manual_reasons': [], 'failures': [], 'signature': 'sig', 'rounds': 1}
    body = ai.comment_body(context, report(), '合成状态')
    assert ai.read_cache([{'user': {'login': 'member'}, 'body': body}], context['head']) is None
    bot = {'user': {'login': 'github-actions[bot]'}, 'body': body}
    assert ai.read_cache([bot], 'b' * 40) is None
    assert ai.read_cache([bot], context['head'])['rounds'] == 1
    context['failed_run'] = True
    assert ai.read_cache([{'user': bot['user'], 'body': ai.comment_body(context, report(), '失败')}], context['head']) is None


def fixture(folder):
    candidate = folder / 'candidate'
    candidate.mkdir()
    ai.git(candidate, 'init', '-q')
    ai.git(candidate, 'config', 'user.name', 'Synthetic test')
    ai.git(candidate, 'config', 'user.email', 'synthetic@example.invalid')
    (candidate / 'dojo_plugin').mkdir()
    (candidate / 'dojo_plugin/example.py').write_text('value = 1\n')
    (candidate / 'test').mkdir()
    (candidate / 'test/test_example_unit.py').write_text('assert True\n')
    ai.git(candidate, 'add', '.')
    ai.git(candidate, 'commit', '-qm', 'synthetic base')
    head = ai.git(candidate, 'rev-parse', 'HEAD').stdout.strip()
    result = folder / 'result'
    result.mkdir()
    context = {'mode': 'analyze', 'head': head, 'files': ['dojo_plugin/example.py', 'test/test_example_unit.py']}
    (result / 'context.json').write_text(json.dumps(context))
    (result / 'review.json').write_text(json.dumps(report()))
    return candidate, result, context


def test_patch_accepts_scoped_source_fix_and_added_regression_test():
    with tempfile.TemporaryDirectory() as directory:
        candidate, result, _ = fixture(Path(directory))
        (candidate / 'dojo_plugin/example.py').write_text('value = 2\n')
        (candidate / 'test/test_new_unit.py').write_text('assert 1 + 1 == 2\n')
        ai.package(result, candidate)
        assert 'value = 2' in (result / 'repair.patch').read_text()


def test_patch_cannot_weaken_existing_tests_or_add_unrelated_code():
    for kind in ('test', 'unrelated', 'protected', 'symlink'):
        with tempfile.TemporaryDirectory() as directory:
            candidate, result, _ = fixture(Path(directory))
            if kind == 'test':
                (candidate / 'test/test_example_unit.py').write_text('assert False\n')
            elif kind == 'unrelated':
                (candidate / 'dojo_plugin/unrelated.py').write_text('value = 0\n')
            elif kind == 'protected':
                (candidate / 'AGENTS.md').write_text('Changed instructions\n')
            else:
                (candidate / 'dojo_plugin/example.py').unlink()
                (candidate / 'dojo_plugin/example.py').symlink_to('/etc/passwd')
            rejects(lambda: ai.package(result, candidate))


def test_stale_head_prevents_all_publication():
    context = {'number': 1, 'head': 'a' * 40, 'branch': 'feat/member/test'}
    class Client:
        repo = 'Fisherder/AISecEdu'
        def repo_api(self, path, data=None, method=None):
            assert data is None and method is None
            return {'state': 'open', 'draft': False, 'base': {'ref': 'develop'},
                    'head': {'sha': 'b' * 40}}
    with tempfile.TemporaryDirectory() as directory:
        result = Path(directory)
        (result / 'context.json').write_text(json.dumps(context))
        with patch.object(ai, 'GitHub', Client), patch.object(ai, 'git', side_effect=AssertionError('No git mutation allowed')):
            ai.publish(result, result / 'candidate')


def publish_fixture(folder, *, requires_human=False, manual=False, failures=False, moving=False,
                    feedback_changed=False, ci_changed=False):
    context = {'number': 1, 'node_id': 'synthetic-node', 'mode': 'analyze', 'head': 'a' * 40,
               'branch': 'feat/member/test', 'model': 'synthetic', 'rounds': 0, 'signature': 'sig',
               'manual_reasons': ['protected path'] if manual else [],
               'failures': [{'name': 'audit', 'id': 3}] if failures else []}
    pr = {'number': 1, 'state': 'open', 'draft': False, 'base': {'ref': 'develop', 'sha': 'b' * 40},
          'auto_merge': None, 'user': {'login': 'hunry-1-code'},
          'head': {'sha': context['head'], 'ref': context['branch'], 'repo': {'full_name': 'Fisherder/AISecEdu'}}}
    context['signature'] = ai.state_signature(pr, context['failures'], [])
    value = report()
    value['requires_human'] = requires_human
    value['human_reason'] = '业务判断' if requires_human else ''
    (folder / 'context.json').write_text(json.dumps(context))
    (folder / 'review.json').write_text(json.dumps(value))
    calls = []
    class Client:
        repo = 'Fisherder/AISecEdu'
        reads = 0
        def repo_api(self, path, data=None, method=None):
            calls.append((path, data, method))
            if path == '/pulls/1' and data is None:
                self.reads += 1
                return {**pr, 'head': {**pr['head'], 'sha': 'b' * 40 if moving and self.reads > 1 else context['head']}}
            if '/check-runs' in path:
                return {'check_runs': [{'name': 'audit', 'id': 3, 'conclusion': 'failure'}] if failures or ci_changed else []}
            return {}
        def api(self, path, data=None, method=None):
            calls.append((path, data, method))
            return {}
        def pages(self, path):
            if path == '/issues/1/comments' and feedback_changed:
                return [{'id': 7, 'user': {'login': 'Fisherder'}, 'body': '新的复核意见', 'updated_at': 'synthetic'}]
            return []
    with patch.object(ai, 'GitHub', Client):
        ai.publish(folder, folder / 'candidate')
    return calls


def test_clean_review_requests_bot_approval_and_protected_auto_merge_only():
    with tempfile.TemporaryDirectory() as directory:
        calls = publish_fixture(Path(directory))
    approvals = [data for path, data, method in calls if path == '/pulls/1/reviews']
    assert len(approvals) == 1 and approvals[0]['event'] == 'APPROVE'
    assert approvals[0]['commit_id'] == 'a' * 40
    assert any(path == '/graphql' and 'enablePullRequestAutoMerge' in data['query'] for path, data, method in calls)
    assert not any('/merge' in path for path, _, _ in calls)


def test_manual_decisions_and_failed_ci_never_receive_bot_approval():
    for options in ({'requires_human': True}, {'manual': True}, {'failures': True}, {'moving': True}):
        with tempfile.TemporaryDirectory() as directory:
            calls = publish_fixture(Path(directory), **options)
        assert not any(path == '/pulls/1/reviews' for path, _, _ in calls), options
        assert not any(path == '/graphql' for path, _, _ in calls), options


def test_new_feedback_or_ci_failure_requeues_without_publishing_old_approval():
    for options in ({'feedback_changed': True}, {'ci_changed': True}):
        with tempfile.TemporaryDirectory() as directory:
            calls = publish_fixture(Path(directory), **options)
        assert not any(path == '/pulls/1/reviews' for path, _, _ in calls)
        assert not any(path == '/graphql' for path, _, _ in calls)
        assert not any(path == '/check-runs' and method == 'POST' for path, _, method in calls)
        requests = [data for path, data, method in calls if path.endswith('/dispatches')]
        assert len(requests) == 1 and requests[0]['ref'] == 'develop'


def test_signature_detects_comment_edits_within_the_same_timestamp():
    pr = {'head': {'sha': 'a' * 40}, 'base': {'sha': 'b' * 40}}
    first = [{'id': 1, 'updated': 'same-second', 'body_sha256': 'first'}]
    second = [{'id': 1, 'updated': 'same-second', 'body_sha256': 'second'}]
    assert ai.state_signature(pr, [], first) != ai.state_signature(pr, [], second)


def prepare_fixture(folder, *, behind=0, fork=False, feedback=False, renamed=False):
    head = 'a' * 40
    signature = ai.state_signature({'head': {'sha': head}, 'base': {'sha': 'b' * 40}, 'title': 'synthetic', 'body': ''}, [], [])
    cached_context = {'head': head, 'model': 'synthetic', 'manual_reasons': [], 'failures': [], 'signature': signature, 'rounds': 0}
    body = ai.comment_body(cached_context, report(), '合成缓存')
    class Client:
        repo = 'Fisherder/AISecEdu'
        def repo_api(self, path, data=None, method=None):
            if path == '/pulls/1':
                return {'number': 1, 'node_id': 'node', 'state': 'open', 'draft': False, 'title': 'synthetic', 'body': '',
                        'user': {'login': 'hunry-1-code'}, 'base': {'ref': 'develop', 'sha': 'b' * 40},
                        'head': {'sha': head, 'ref': 'feat/member/test', 'repo': {'full_name': 'external/fork' if fork else self.repo}},
                        'additions': 10, 'deletions': 1}
            if '/check-runs' in path:
                return {'check_runs': []}
            if path.startswith('/compare/'):
                return {'behind_by': behind}
            raise AssertionError(path)
        def pages(self, path):
            if path.endswith('/files'):
                value = {'filename': 'dojo_plugin/courseware_quiz.py'}
                if renamed:
                    value['previous_filename'] = 'dojo_plugin/models/teaching.py'
                return [value]
            if path.endswith('/commits'):
                return [{'commit': {'message': 'human feature', 'author': {'name': 'member'}}, 'parents': [{}]}]
            if path == '/issues/1/comments':
                result = [{'id': 1, 'user': {'login': 'github-actions[bot]'}, 'body': body}]
                if feedback:
                    result.append({'id': 2, 'user': {'login': 'Fisherder'}, 'body': '请修复比较运算符去重', 'updated_at': 'synthetic'})
                return result
            if path.endswith('/reviews') or path == '/pulls/1/comments':
                return []
            raise AssertionError(path)
    event = folder / 'event.json'
    event.write_text(json.dumps({'issue': {'number': 1, 'pull_request': {}}}))
    outputs = {}
    with patch.object(ai, 'GitHub', Client), patch.object(ai, 'set_outputs', side_effect=lambda **values: outputs.update(values)), \
            patch.dict(os.environ, {'GITHUB_EVENT_PATH': str(event)}):
        ai.prepare(folder / 'result')
    context_path = folder / 'result/context.json'
    return outputs, json.loads(context_path.read_text()) if context_path.exists() else None


def test_base_updates_and_new_feedback_override_cached_passes():
    with tempfile.TemporaryDirectory() as directory:
        outputs, context = prepare_fixture(Path(directory), behind=1)
        assert outputs['mode'] == 'update'
    with tempfile.TemporaryDirectory() as directory:
        outputs, context = prepare_fixture(Path(directory), feedback=True)
        assert outputs['mode'] == 'analyze'
        assert context['review_feedback'][0]['body'] == '请修复比较运算符去重'
    with tempfile.TemporaryDirectory() as directory:
        outputs, context = prepare_fixture(Path(directory))
        assert outputs['mode'] == 'cached'


def test_forks_are_skipped_and_renaming_cannot_hide_protected_paths():
    with tempfile.TemporaryDirectory() as directory:
        outputs, context = prepare_fixture(Path(directory), fork=True)
        assert outputs['mode'] == 'skip' and context is None
    with tempfile.TemporaryDirectory() as directory:
        outputs, context = prepare_fixture(Path(directory), renamed=True)
        assert any('models/teaching.py' in row for row in context['manual_reasons'])


def test_repair_plan_only_invokes_coder_for_actionable_allowed_findings():
    for kind in ('clean', 'allowed', 'protected', 'exhausted'):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            context = {'repairable_files': ['dojo_plugin/example.py'], 'rounds': 2 if kind == 'exhausted' else 0}
            value = report()
            if kind != 'clean':
                value['findings'] = [{'priority': 2, 'file': 'ops/team/ai_pr.py' if kind == 'protected' else 'dojo_plugin/example.py',
                                      'line': 1, 'message': '合成缺陷'}]
            (folder / 'context.json').write_text(json.dumps(context))
            (folder / 'initial-review.json').write_text(json.dumps(value))
            (folder / 'repair.txt').write_text('trusted repair instructions')
            outputs = {}
            with patch.object(ai, 'set_outputs', side_effect=lambda **rows: outputs.update(rows)):
                ai.plan(folder)
            assert outputs['should_repair'] is (kind == 'allowed')
            final = json.loads((folder / 'review.json').read_text())
            assert final['requires_human'] is (kind in ('protected', 'exhausted'))
            if kind == 'allowed':
                assert '合成缺陷' in (folder / 'repair.txt').read_text()


def test_changed_detects_untracked_regression_tests_before_final_review():
    with tempfile.TemporaryDirectory() as directory:
        candidate, result, _ = fixture(Path(directory))
        outputs = {}
        with patch.object(ai, 'set_outputs', side_effect=lambda **rows: outputs.update(rows)):
            ai.changed(result, candidate)
            assert outputs['has_patch'] is False
            (candidate / 'test/test_added_unit.py').write_text('assert True\n')
            ai.changed(result, candidate)
            assert outputs['has_patch'] is True


if __name__ == '__main__':
    suite = unittest.TestSuite(unittest.FunctionTestCase(value) for name, value in list(globals().items())
                               if name.startswith('test_') and callable(value))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
