import hashlib
import json

RUBRIC_VERSION = 'hw01-tiered-v3'
STAGES = {'basic': '基础部分', 'thinking': '思考题'}
MAIN_RULES = (
    ('copy', '完整复制与中文字节', ('copy', 'utf8'), 15, 3),
    ('capacity', '容量与拒绝截断', ('capacity', 'truncation'), 15, 3),
    ('invalid', '无效参数处理', ('invalid',), 15, 4),
    ('termination', '结尾与限定读取', ('termination',), 15, 5),
    ('memory', '内存边界与动态检测', ('memory', 'sanitizer'), 15, 3),
    ('random', '新生成的边界输入', ('random',), 5, 48),
)
REPAIRS = ('unbounded', 'termination', 'truncation', 'off_by_one')
AI_RULES = (
    {'id': 'clarity', 'title': '接口实现的清晰与可维护性', 'maxScore': 0},
    {'id': 'repair-design', 'title': '修正入口的设计一致性', 'maxScore': 0},
)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def criterion(identifier, title, stage, maximum, rows, expected, gate=True):
    passed = sum(r.get('passed') is True for r in rows)
    score = round(maximum * min(passed, expected) / expected, 2) if gate and expected else 0
    complete = gate and len(rows) >= expected and all(r.get('passed') is True for r in rows)
    return {'id': identifier, 'title': title, 'stage': stage, 'score': score, 'maxScore': maximum, 'status': 'complete' if complete else 'partial' if score else 'missing', 'passedChecks': passed, 'expectedChecks': expected, 'evidence': [r.get('id') for r in rows if r.get('id')], 'missingChecks': [r.get('name') for r in rows if r.get('passed') is not True]}


def grade_results(results, formal=True, rubric_version=RUBRIC_VERSION):
    if rubric_version == 'hw01-tiered-v2':
        import importlib.util
        from pathlib import Path
        spec=importlib.util.spec_from_file_location('legacy_coding_rubric',Path(__file__).with_name('coding_rubric_v2.py'))
        legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
        return legacy.grade_results(results,formal)
    if rubric_version != RUBRIC_VERSION:raise ValueError('不支持的评分版本')
    groups = {}
    for index, raw in enumerate(results):
        row = dict(raw)
        row.setdefault('id', f'check-{index + 1}')
        groups.setdefault(row.get('component', 'unknown'), []).append(row)
    main = groups.get('main', [])
    main_gate = len([r for r in main if r['group'] in ('compile', 'interface') and r.get('passed') is True]) == 3
    criteria = []
    for key, title, categories, maximum, expected in MAIN_RULES:
        if key == 'random' and not formal:
            criteria.append({'id': 'main.random', 'title': title, 'stage': 'basic', 'score': 0, 'maxScore': maximum, 'status': 'not-run', 'evidence': [], 'missingChecks': ['正式核验才运行本项']})
            continue
        selected = [r for r in main if r['group'] in categories]
        criteria.append(criterion('main.' + key, title, 'basic', maximum, selected, expected, main_gate))
    for name in REPAIRS:
        rows = groups.get('repair.' + name, [])
        gate_rows = [r for r in rows if r['group'] in ('compile', 'interface', 'sanitizer')]
        gate = len(gate_rows) == 4 and all(r.get('passed') is True for r in gate_rows)
        selected = [r for r in rows if r['group'] not in ('compile', 'interface', 'sanitizer', 'source')]
        item = criterion('repair.' + name, '四类修正 / ' + {'unbounded':'无界复制','termination':'没有结尾','truncation':'意外截断','off_by_one':'差一错误'}[name], 'thinking', 5, selected, 25 if formal else 17, gate)
        item['score'] = 5 if item['status']=='complete' else 0
        criteria.append(item)
    stages = {}
    for stage, maximum in (('basic', 80), ('thinking', 20)):
        entries = [c for c in criteria if c['stage'] == stage]
        complete = formal and all(c['status'] == 'complete' for c in entries)
        if stage == 'basic':
            complete = complete and bool(main) and all(r.get('passed') is True for r in main)
        stages[stage] = {'title': STAGES[stage], 'score': round(sum(c['score'] for c in entries), 2), 'maxScore': maximum, 'passed': complete}
    return {'rubricVersion': RUBRIC_VERSION, 'criteria': criteria, 'stages': stages, 'objectiveScore': round(sum(s['score'] for s in stages.values()), 2), 'maxObjectiveScore': 100, 'maxAiScore': 0, 'formal': formal}


def normalize_ai_review(value, payload):
    if payload.get('grading', {}).get('rubricVersion') == 'hw01-tiered-v2':
        import importlib.util
        from pathlib import Path
        spec=importlib.util.spec_from_file_location('legacy_ai_rubric',Path(__file__).with_name('coding_rubric_v2.py'))
        legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
        return legacy.normalize_ai_review(value,payload)
    if not isinstance(value, dict) or value.get('submissionSha256') != payload.get('submissionSha256'):
        raise ValueError('AI 评价未绑定本次源码')
    if not isinstance(value.get('criteria'), list):
        raise ValueError('AI 评价缺少量规')
    by_id = {r.get('id'): r for r in value['criteria'] if isinstance(r, dict)}
    output = []
    for rule in AI_RULES:
        raw = by_id.get(rule['id'])
        if isinstance(raw,dict):raw={**raw,'score':raw.get('score',0)}
        if not raw or type(raw.get('score')) not in (int, float) or not 0 <= raw['score'] <= rule['maxScore']:
            raise ValueError('AI 分值超出量规')
        citations = raw.get('citations')
        if not isinstance(citations, list) or not citations:
            raise ValueError('AI 评价必须引用源码证据')
        verified = []
        for cite in citations[:5]:
            file = (payload.get('sources') or {}).get(cite.get('file')) if isinstance(cite, dict) else None
            line = cite.get('line') if isinstance(cite, dict) else None
            quote = cite.get('quote') if isinstance(cite, dict) else None
            lines = str((file or {}).get('text', '')).splitlines()
            if not file or type(line) is not int or not 1 <= line <= len(lines) or not isinstance(quote, str) or not quote.strip() or quote not in lines[line - 1]:
                raise ValueError('AI 引用不能在所保存的源码中定位')
            verified.append({'file': cite['file'], 'line': line, 'quote': quote[:240]})
        gate = payload['grading']['stages']['basic']['score'] >= 30 if rule['id'] == 'clarity' else payload['grading']['stages']['thinking']['score'] > 0
        score = round(raw['score'], 2) if gate else 0
        output.append({**rule, 'score': score, 'reason': str(raw.get('reason') or '')[:600], 'citations': verified})
    return {'criteria': output, 'score': round(sum(r['score'] for r in output), 2), 'maxScore': 0, 'feedback': str(value.get('feedback') or '')[:1600], 'submissionSha256': payload['submissionSha256'], 'status': 'suggested', 'completed': [c['title'] for c in payload['grading']['criteria'] if c['status'] == 'complete'], 'missing': [c['title'] for c in payload['grading']['criteria'] if c['status'] != 'complete']}
