import ast
from contextlib import contextmanager
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
import unittest


ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('authoring_standards',ROOT/'dojo_plugin/authoring_standards/__init__.py')
policy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


@contextmanager
def catalog():
    with tempfile.TemporaryDirectory() as temporary:
        root=Path(temporary)/'rules'
        shutil.copytree(policy.ROOT,root)
        yield root


def edit_index(root, function):
    path=root/'index.json'
    data=json.loads(path.read_text())
    function(data)
    path.write_text(json.dumps(data))


def rejects(function):
    try:
        function()
    except policy.StandardsError:
        return
    raise AssertionError('Expected StandardsError')


def coding_spec():
    return {'name':'安全复制','description':'完成函数并执行核验','runtimeEnvironment':'linux','coding_workspace':{'course':'software-security','assignment':'hw02-input-check','title':'第02次作业','source':'main.c'},'starterFiles':[{'path':p,'content':'example'} for p in ['starter/main.c','starter/README.md','starter/Makefile']],'codingGrading':{'publicCommand':'make check','formalCommand':'make submit','reportRequired':False,'submission':'code','testVersion':'v1'}}


def test_specific_layers_and_type_ancestry():
    result=policy.resolve(course_id=3839952,question_type='coding',assignment_id='safe-copy')
    assert [r['id'] for r in result['layers']]==['global.core','type.practice','type.coding','course.software-security','course.software-security.coding','assignment.safe-copy']
    registry=json.loads((policy.ROOT/'index.json').read_text(encoding='utf-8'))
    assignment=next(r for r in registry['layers'] if r['id']=='assignment.safe-copy')
    assert str(assignment['courseId'])=='3839952' and assignment['questionType']=='coding' and assignment['assignmentId']=='safe-copy'
    assert result['defaults']['mainSource']==assignment['defaults']['mainSource']
    assert result['origins']['defaults.mainSource']==assignment['id']
    assert result['layers'][-1]['version']==assignment['version']
    assert result['layers'][-1]['content'].strip()==(policy.ROOT/assignment['document']).read_text(encoding='utf-8').strip()
    assert result['origins']['requirements.reportRequired']=='type.coding'


def test_other_courses_do_not_inherit_course_or_assignment_rules():
    result=policy.resolve(course_id=11,question_type='coding',assignment_id='safe-copy')
    assert [r['level'] for r in result['layers']]==['global','type','type']
    assert 'language' not in result['defaults']


def test_quiz_does_not_inherit_coding_requirements():
    result=policy.resolve(course_id=3839952,question_type='quiz')
    assert 'reportRequired' not in result['requirements']
    assert 'make check' not in policy.prompt(result)


def test_unknown_type_is_an_error():
    rejects(lambda:policy.resolve(question_type='codng'))


def test_locked_requirement_cannot_be_weakened():
    with catalog() as root:
        edit_index(root,lambda d:d['layers'][-1].update(requirements={'reportRequired':True}))
        rejects(lambda:policy.resolve(course_id=3839952,question_type='coding',assignment_id='safe-copy',root=root))


def test_defaults_cannot_override_locked_requirement():
    with catalog() as root:
        edit_index(root,lambda d:d['layers'][-1].update(defaults={'reportRequired':True}))
        rejects(lambda:policy.resolve(course_id=3839952,question_type='coding',assignment_id='safe-copy',root=root))


def test_more_specific_defaults_can_override():
    with catalog() as root:
        edit_index(root,lambda d:d['layers'][-1].update(defaults={'language':'Python'}))
        assert policy.resolve(course_id=3839952,question_type='coding',assignment_id='safe-copy',root=root)['defaults']['language']=='Python'


def test_same_level_conflict_is_rejected():
    with catalog() as root:
        edit_index(root,lambda d:d['layers'].append({**d['layers'][0],'id':'global.second','defaults':{'publishMode':'immediate'}}))
        rejects(lambda:policy.resolve(root=root))


def test_selected_missing_document_fails_closed():
    with catalog() as root:
        (root/'types/coding.md').unlink()
        rejects(lambda:policy.resolve(question_type='coding',root=root))
        assert policy.resolve(question_type='quiz',root=root)


def test_path_traversal_and_symlinks_are_rejected():
    with catalog() as root:
        edit_index(root,lambda d:d['layers'][0].update(document='../private.md'))
        rejects(lambda:policy.resolve(root=root))
    with catalog() as root:
        (root/'global/core.md').unlink()
        (root/'global/core.md').symlink_to(root/'types/quiz.md')
        rejects(lambda:policy.resolve(root=root))


def test_content_change_invalidates_digest_even_without_version_change():
    with catalog() as root:
        before=policy.resolve(root=root)
        path=root/'global/core.md'
        path.write_text(path.read_text()+'\n新增标准\n')
        after=policy.resolve(root=root)
        assert before['digest']!=after['digest']


def test_snapshot_is_complete_and_tampering_is_rejected():
    bundle=policy.resolve(question_type='coding')
    assert 'make submit' in policy.prompt(bundle)
    bundle['layers'][0]['content']='pretend rules'
    rejects(lambda:policy.prompt(bundle))


def test_client_snapshot_is_replaced_with_server_rules():
    constraints={'questionType':'coding','authoringStandards':{'digest':'forged'}}
    bound=policy.bind_constraints(SimpleNamespace(dojo_id=3839952),constraints)
    assert bound['authoringStandards']['digest']!='forged'
    assert constraints['authoringStandards']['digest']=='forged'
    assert '编号工程' not in str(constraints)


def test_general_profile_cannot_bypass_practice_policy():
    rejects(lambda:policy.bind_constraints(SimpleNamespace(dojo_id=1),{'questionType':'general'}))


def test_coding_static_contract_passes_and_answer_gate_blocks():
    bundle=policy.resolve(course_id=3839952,question_type='coding')
    value=coding_spec()
    assert all(r['status']=='PASS' for r in policy.validate_spec(value,bundle))
    value['verificationAnswer']='preset-answer'
    assert any(r['id']=='standard-no-answer-gate' and r['status']=='BLOCK' for r in policy.validate_spec(value,bundle))


def test_coding_reports_wrong_directory_missing_source_are_blocked():
    bundle=policy.resolve(course_id=3839952,question_type='coding')
    value=coding_spec()
    value['coding_workspace'].update(course='wrong-course',assignment='challenge',source='../main.c')
    value['codingGrading']['reportRequired']=True
    blocked={r['id'] for r in policy.validate_spec(value,bundle) if r['status']=='BLOCK'}
    assert {'standard-course-directory','standard-numbered-workspace','standard-source-at-root','standard-no-report'}.issubset(blocked)


def test_model_context_gets_full_selected_rules():
    bound=policy.bind_constraints(SimpleNamespace(dojo_id=3839952),{'questionType':'coding'})
    guidance=policy.model_guidance({'constraints':bound})
    selected=policy.resolve(course_id=3839952,question_type='coding')
    registry={r['id']:r for r in json.loads((policy.ROOT/'index.json').read_text(encoding='utf-8'))['layers']}
    assert bound['questionType']=='coding'
    assert [r['id'] for r in bound['authoringStandards']['layers']]==[r['id'] for r in selected['layers']]
    assert {'type.coding','course.software-security.coding'}.issubset({r['id'] for r in selected['layers']})
    assert registry['type.coding']['questionType']=='coding'
    assert str(registry['course.software-security.coding']['courseId'])=='3839952' and registry['course.software-security.coding']['questionType']=='coding'
    for layer in selected['layers']:
        registered=registry[layer['id']]
        assert layer['version']==registered['version']
        assert f"[{layer['id']} v{registered['version']}]" in guidance
        assert layer['content'].strip()==(policy.ROOT/registered['document']).read_text(encoding='utf-8').strip()
        assert layer['content'].strip() in guidance
    assert policy.model_guidance({'spec':{'authoringStandards':bound['authoringStandards']}})==''


def test_actual_model_constraint_filter_preserves_policy_snapshot():
    tree=ast.parse((ROOT/'dojo_plugin/learning/authoring.py').read_text())
    names={'PUBLIC_CONSTRAINT_KEYS','_model_constraints'}
    nodes=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in names or isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in node.targets)]
    namespace={'copy':copy}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'authoring.py','exec'),namespace)
    bound=policy.bind_constraints(SimpleNamespace(dojo_id=3839952),{'questionType':'coding'})
    assert namespace['_model_constraints'](bound)['authoringStandards']==bound['authoringStandards']


def test_planner_receives_rules_before_type_is_known():
    value=policy.planner_context(3839952)
    assert 'course.software-security' in value['instructions']
    assert 'constraints.questionType=coding' in value['typeSelection']
    assert 'quiz' in value['typeCatalog']


def test_malformed_type_cannot_bypass_loading():
    rejects(lambda:policy.resolve(question_type={}))
    rejects(lambda:policy.bind_constraints(SimpleNamespace(dojo_id=1),{'questionType':['coding']}))


def test_missing_policy_keeps_unrelated_planning_available():
    from unittest.mock import patch
    with patch.object(policy,'resolve',side_effect=policy.StandardsError('missing')):
        context=policy.planner_context()
        assert context['status']=='unavailable'
        assert '不能生成' in context['instructions']
        rejects(lambda:policy.bind_constraints(SimpleNamespace(dojo_id=1),{'questionType':'coding'}))


def test_workspace_identity_compares_course_and_assignment():
    tree=ast.parse((ROOT/'dojo_plugin/authoring_standards/runtime.py').read_text())
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='same_workspace')
    scope={}
    exec(compile(ast.Module(body=[node],type_ignores=[]),'runtime.py','exec'),scope)
    compare=scope['same_workspace']
    assert compare({'course':'c','assignment':'hw01-x'},{'course':'c','assignment':'hw01-x'})
    assert not compare({'course':'c','assignment':'hw01-x'},{'course':'c','assignment':'hw02-x'})
    assert not compare({'course':'c','assignment':'hw01-x'},{'course':'other','assignment':'hw01-x'})
    assert not compare({}, {})


def test_existing_draft_identity_selects_assignment_rules():
    result=policy.bind_constraints(SimpleNamespace(dojo_id=3839952),{'questionType':'coding'},assignment_id='safe-copy')
    assert result['authoringStandards']['layers'][-1]['id']=='assignment.safe-copy'


def test_coding_metadata_cannot_be_labeled_as_generic_practice():
    for kind in ('practice', 'simulation'):
        result=policy.bind_constraints(SimpleNamespace(dojo_id=3839952),{'questionType':kind,'coding_workspace':{'assignment':'hw02-example'}})
        assert result['questionType']=='coding'
        assert result['authoringStandards']['requirements']['reportRequired'] is False


def test_existing_coding_spec_selects_coding_rules_without_constraint_hint():
    result=policy.bind_constraints(SimpleNamespace(dojo_id=3839952),{},spec={'codingGrading':{'submission':'code'}})
    assert result['questionType']=='coding'
    tree=ast.parse((ROOT/'dojo_plugin/learning/authoring.py').read_text())
    for name in ('validate_draft','publish_draft','revise_draft'):
        node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
        calls=[call for call in ast.walk(node) if isinstance(call,ast.Call) and isinstance(call.func,ast.Name) and call.func.id=='bind_constraints']
        assert calls and all(any(key.arg=='spec' for key in call.keywords) for call in calls)


def practice_spec():
    return {'name':'实践一','description':'编辑工作文件并检查','runtimeEnvironment':'windows2000','workspaceLayout':{'schemaVersion':1,'course':'software-security','assignment':'lab01-auth-analysis','studentRoot':r'C:\Courses\software-security\lab01-auth-analysis','editablePaths':['work/method1.exe','work/method2.exe'],'materialPaths':['main.cpp','materials/crackme-original.exe'],'graderRoot':r'C:\Lab','checkEntry':'check.cmd','submitEntry':'platform-dynamic-flag','testVersion':'legacy-auth-unchanged','reportRequired':False}}


def test_practice_missing_layout_is_blocked():
    checks=policy.validate_spec({'name':'题目','description':'说明'},policy.resolve(question_type='practice'))
    assert any(row['id']=='standard-workspace-manifest' and row['status']=='BLOCK' for row in checks)


def test_windows_legacy_layout_contract_passes():
    checks=policy.validate_spec(practice_spec(),policy.resolve(course_id=3839952,question_type='practice',assignment_id='ollydbg-auth'))
    assert all(row['status']=='PASS' for row in checks),checks


def test_workspace_escape_and_malformed_paths_are_blocked():
    for value in ('../outside','C:/outside','work/../../outside','work\\outside',{},None):
        item=practice_spec();item['workspaceLayout']['editablePaths']=[value]
        checks=policy.validate_spec(item,policy.resolve(question_type='practice'))
        assert any(row['status']=='BLOCK' for row in checks),value


def test_grader_inside_student_workspace_is_blocked():
    item=practice_spec();item['workspaceLayout']['graderRoot']=item['workspaceLayout']['studentRoot']+'\\tools'
    checks=policy.validate_spec(item,policy.resolve(question_type='practice'))
    assert next(row for row in checks if row['id']=='standard-grader-separation')['status']=='BLOCK'


def test_explicit_coding_layout_cannot_point_at_other_assignment():
    item=coding_spec();item['workspaceLayout']=practice_spec()['workspaceLayout']
    checks=policy.validate_spec(item,policy.resolve(question_type='coding'))
    assert next(row for row in checks if row['id']=='standard-workspace-consistency')['status']=='BLOCK'


def test_student_package_cannot_include_private_tests():
    item=practice_spec();item['starterFiles']=[{'path':'starter/private-tests/test.py','content':'private'}]
    checks=policy.validate_spec(item,policy.resolve(question_type='practice'))
    assert next(row for row in checks if row['id']=='standard-workspace-private-files')['status']=='BLOCK'


def test_windows_layout_embedded_runner_has_valid_syntax():
    import textwrap
    path=ROOT/'workspace/services/windows-desktop/assignment-layout/tidy-runtime.py'
    tree=ast.parse(path.read_text())
    node=next(n for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='runner' for t in n.targets))
    runner=textwrap.dedent(node.value.args[0].value)
    compile(runner,'windows-layout-runner','exec')


if __name__=='__main__':
    suite=unittest.TestSuite(unittest.FunctionTestCase(value) for name,value in globals().copy().items() if name.startswith('test_'))
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
