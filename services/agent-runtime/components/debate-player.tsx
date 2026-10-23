'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DebateAttempt, DebateIntent, DebateSide, DebateSpec } from '@/lib/debate/schema';
import { argumentLedger, DEBATE_INTENTS, phaseIndex } from '@/lib/debate/session';
import styles from './debate-player.module.css';

type Action = {action: 'turn' | 'reflect'; requestId: string; attemptId: string; expectedTurn: number;
  message: string; intent?: DebateIntent; targetSpeakerId?: string; evidenceIds?: string[]; earlyFinish?: boolean};
const levels = ['', '尚需支持', '初步形成', '清晰有据', '能迁移与反思'];
const sides: Record<DebateSide, string> = {pro: '支持方', con: '反对方', neutral: '探究者'};
const moveLabels = {claim: '主张', challenge: '质询', concession: '让步', synthesis: '共识与分歧'};
const draftKey = (id: string) => `aisecedu-debate-draft:${id}`;
const makeId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
function saveDraft(id: string, value?: object) {
  try { if (value) localStorage.setItem(draftKey(id), JSON.stringify(value)); else localStorage.removeItem(draftKey(id)); } catch {}
}

export function DebatePlayer({artifactId, spec: initialSpec}: {artifactId: string; spec: DebateSpec}) {
  const [spec, setSpec] = useState(initialSpec);
  const [attempts, setAttempts] = useState<DebateAttempt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [side, setSide] = useState<DebateSide>('pro');
  const [canReview, setCanReview] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [intent, setIntent] = useState<DebateIntent>('respond');
  const [target, setTarget] = useState('');
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [earlyFinish, setEarlyFinish] = useState(false);
  const [hint, setHint] = useState(false);
  const [revision, setRevision] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const [editNotice, setEditNotice] = useState('');
  const pending = useRef<Action | null>(null);
  const startKey = useRef<string | null>(null);
  const attempt = attempts.find(item => item.id === selectedId);
  const current = attempt?.spec || spec;
  const v2 = current.schema === 'debate-v2' ? current : null;
  const phase = attempt ? phaseIndex(current, attempt.turns) : 0;
  const round = current.rounds[phase];
  const reflecting = attempt?.status === 'REFLECTING' || earlyFinish;
  const locked = busy || !!attempt?.pending;
  const ledger = argumentLedger(attempt?.turns || []);
  const roleName = (id: string) => v2?.roles.find(role => role.id === id)?.name || id;

  const load = useCallback(async (isReview: boolean) => {
    const response = await fetch(`/api/debates/${artifactId}${isReview ? '?review=1' : ''}`);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '无法读取辩论记录');
    setSpec(data.spec); setRevision(data.revision); setCanReview(data.canReview); setAttempts(data.attempts);
    return data.attempts as DebateAttempt[];
  }, [artifactId]);

  useEffect(() => {
    load(false).then(rows => setSelectedId(rows[0]?.id || null))
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    setMessage(''); pending.current = null; setHint(false); setEarlyFinish(false); setIntent('respond'); setTarget(''); setEvidenceIds([]);
    if (!selectedId || review) return;
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey(selectedId)) || 'null');
      if (draft && typeof draft.message === 'string') {
        setMessage(draft.message);
        if (draft.intent && draft.intent in DEBATE_INTENTS) setIntent(draft.intent);
        setTarget(typeof draft.targetSpeakerId === 'string' ? draft.targetSpeakerId : '');
        setEvidenceIds(Array.isArray(draft.evidenceIds) ? draft.evidenceIds : []);
        setEarlyFinish(draft.earlyFinish === true);
        if (draft.requestId && draft.attemptId === selectedId) pending.current = draft;
      }
    } catch {}
  }, [selectedId, review]);

  useEffect(() => {
    if (!attempt || !pending.current) return;
    if (attempt.turns.length > pending.current.expectedTurn || attempt.status === 'COMPLETED') {
      pending.current = null; setMessage(''); setEvidenceIds([]); setIntent('respond'); setEarlyFinish(false);
      saveDraft(attempt.id);
    }
  }, [attempt]);

  useEffect(() => {
    if (!attempt?.pending || busy) return;
    const timer = setInterval(() => { load(review).catch(e => setError(e.message)); }, 5000);
    return () => clearInterval(timer);
  }, [attempt?.pending, busy, load, review]);

  function updateDraft(change: Partial<{message: string; intent: DebateIntent; targetSpeakerId: string; evidenceIds: string[]; earlyFinish: boolean}>) {
    if (change.message !== undefined) setMessage(change.message);
    if (change.intent !== undefined) setIntent(change.intent);
    if (change.targetSpeakerId !== undefined) setTarget(change.targetSpeakerId);
    if (change.evidenceIds !== undefined) setEvidenceIds(change.evidenceIds);
    if (change.earlyFinish !== undefined) setEarlyFinish(change.earlyFinish);
    pending.current = null;
    if (attempt && !review) saveDraft(attempt.id, {message, intent, targetSpeakerId: target, evidenceIds, earlyFinish, ...change});
  }

  async function post(body: object) {
    const response = await fetch(`/api/debates/${artifactId}`, {method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(160000)});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '暂时无法提交，请重试');
    const updated = data.attempt as DebateAttempt;
    setAttempts(previous => [updated, ...previous.filter(item => item.id !== updated.id)]);
    setSelectedId(updated.id);
    return updated;
  }

  async function start() {
    setBusy(true); setError('');
    try {
      startKey.current ||= makeId();
      await post({action: 'start', requestId: startKey.current, side});
      startKey.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : '无法开始辩论'); }
    finally { setBusy(false); }
  }

  async function submit(override?: DebateIntent) {
    if (!attempt || locked || review) return;
    const chosenIntent = override || intent;
    const text = message.trim() || (chosenIntent === 'listen' ? '请各位围绕当前分歧展开交锋，我先旁听。' : chosenIntent === 'advance' ? '请收束当前分歧，进入下一环节。' : '');
    if (!text) return;
    setBusy(true); setError('');
    try {
      const action: Action = pending.current || {action: reflecting ? 'reflect' : 'turn', requestId: makeId(),
        attemptId: attempt.id, expectedTurn: attempt.turns.length, message: text,
        ...(v2 ? {intent: chosenIntent, ...(target ? {targetSpeakerId: target} : {}), evidenceIds, earlyFinish} : {})};
      pending.current = action; saveDraft(attempt.id, action);
      await post(action); pending.current = null; setMessage(''); setEvidenceIds([]); setIntent('respond'); setEarlyFinish(false);
      saveDraft(attempt.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请重试');
      await load(review).catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function switchReview() {
    if (locked) return;
    setLoading(true); setError('');
    try {
      const rows = await load(!review); setReview(!review); setSelectedId(rows[0]?.id || null);
    } catch (e) { setError(e instanceof Error ? e.message : '无法读取记录'); }
    finally { setLoading(false); }
  }

  function requestEdit() {
    if (!editText.trim()) return;
    if (window.parent === window) { setEditNotice('请在教学平台的活动详情中使用“继续修改”，可以连续提出修改要求。'); return; }
    window.parent.postMessage({type: 'aisecedu:debate-revision-request', artifactId, instruction: editText.trim()}, window.location.origin);
    setEditNotice('修改要求已填入上方编辑区。确认提交后，可继续追加下一轮要求。');
  }

  function download() {
    if (!attempt) return;
    const lines = [`# ${current.title}`, current.motion, `身份：${current.studentRole}`, `立场：${sides[attempt.side]}`, '',
      ...attempt.turns.flatMap(turn => [`## ${current.rounds[turn.round]?.title || '讨论'}`, `${turn.intent === 'listen' ? '旁听请求' : '学生'}：${turn.student}`,
        ...(turn.reply.voices?.map(voice => `${roleName(voice.speakerId)}：${voice.content}`) || [`AI：${turn.reply.acknowledgement}\n${turn.reply.argument}`]),
        turn.reply.question, turn.reply.coaching.feedback ? `论证建议：${turn.reply.coaching.feedback}` : '', '']),
      `## 学习反思\n${attempt.reflection || '尚未提交'}`,
      ...(attempt.report ? [`## 复盘反馈\n${attempt.report.summary}`,
        ...attempt.report.criteria.map(item => `${current.rubric.find(r => r.id === item.rubricId)?.title}：${levels[item.level]}\n${item.feedback}`),
        ...attempt.report.nextSteps] : [])];
    const url = URL.createObjectURL(new Blob([lines.join('\n\n')], {type: 'text/markdown;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = 'AI辩论复盘.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className={styles.root} data-debate-player data-aisecedu-preview-state="ready">
    <header className={styles.header}>
      <div><span className={styles.format}>{v2?.format.label || '双人辩论'} / AI 角色对话{v2 ? ` / 约 ${v2.rules.durationMinutes} 分钟` : ''}</span><h1>{current.title}</h1><p>{current.motion}</p></div>
      {canReview && <div className={styles.headerActions}><button onClick={() => setEditOpen(!editOpen)} aria-expanded={editOpen}>用自然语言修改</button><button onClick={switchReview} disabled={locked}>{review ? '返回教师试练' : '查看学生记录'}</button></div>}
    </header>
    {editOpen && <section className={styles.editor} aria-label="修改辩论活动"><h2>继续调整这场辩论</h2><p>可以连续修改赛制、时长、角色或某一段内容。未要求变动的内容会保留；已开始的学生记录保持原版本。</p>
      <textarea aria-label="辩论修改要求" value={editText} onChange={e => setEditText(e.target.value)} maxLength={16000} placeholder="例如：改成三方听证会，加入学生代表；第二环节多追问两次，其他内容保留。" rows={3} />
      <div className={styles.composeActions}><button className={styles.primary} onClick={requestEdit} disabled={!editText.trim()}>带入修改区</button><span role="status">{editNotice}</span></div></section>}
    <div className={styles.toolbar}>
      <span>{review ? '学生学习记录' : attempt?.preview ? '教师试练，不计入学生记录' : '对话自动保存，可随时回来继续'}</span>
      {attempts.length > 0 && <label>历史记录 <select aria-label="选择辩论记录" value={selectedId || ''} disabled={locked} onChange={e => setSelectedId(e.target.value || null)}>
        <option value="">{review ? '选择学生记录' : '开始新的辩论'}</option>
        {attempts.map(item => <option key={item.id} value={item.id}>{item.studentName ? `${item.studentName} · ` : ''}{sides[item.side]} · {item.turns.length} 次往返 · {item.status === 'COMPLETED' ? '已复盘' : '进行中'} · {new Date(item.updated).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</option>)}
      </select></label>}
      {attempt && <button onClick={download}>导出复盘</button>}
    </div>
    {error && <div className={styles.error} role="alert">{error}<button disabled={busy} onClick={() => {setError(''); load(review).catch(e => setError(e.message));}}>刷新记录</button></div>}
    {loading && <p role="status">正在读取活动与记录…</p>}
    {attempt && attempt.revision !== revision && <p className={styles.notice}>教师已更新活动。本次继续使用第 {attempt.revision} 版；新建辩论会使用最新版。</p>}
    {v2 && <section className={styles.cast} aria-label="辩论参与者">{v2.roles.map((role, index) => <button key={role.id} type="button" aria-pressed={target === role.id}
      disabled={locked || review || !attempt || attempt.status !== 'ACTIVE' || reflecting}
      onClick={() => updateDraft({targetSpeakerId: target === role.id ? '' : role.id})}>
      <span className={styles.avatar}>{role.name.slice(0, 1)}<small>{index + 1}</small></span><span><strong>{role.name}</strong><small>{role.identity}</small><span>{attempt ? role.stance : role.opening}</span></span>
    </button>)}</section>}
    <ol className={styles.phases} aria-label="辩论环节">{current.rounds.map((item, index) => <li key={item.id} aria-current={attempt?.status === 'ACTIVE' && index === phase ? 'step' : undefined} data-complete={attempt && index < phase}>
      <span>{index + 1}</span><div>{item.title}{'exchanges' in item && <small>计划 {item.exchanges} 次往返</small>}</div></li>)}</ol>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <details className={styles.brief} open={!attempt}><summary>情境与参与任务</summary><p>{current.scenario}</p><p><strong>你的身份</strong><br />{current.studentRole}</p>{v2 && <p>{v2.format.description}</p>}<ul>{current.objectives.map(item => <li key={item}>{item}</li>)}</ul></details>
        <details className={styles.resources} open><summary>资料与证据 <small>{current.evidence.length}</small></summary><p className={styles.muted}>选中资料可在发言时引用。教学假设不是真实统计。</p>
          {current.evidence.map(item => <div key={item.id} className={styles.evidence}>
            {v2 && attempt?.status === 'ACTIVE' && !review && <label><input type="checkbox" aria-label={`引用 ${item.title}`} checked={evidenceIds.includes(item.id)} disabled={locked} onChange={e => updateDraft({evidenceIds: e.target.checked ? [...evidenceIds, item.id] : evidenceIds.filter(id => id !== item.id)})} />引用</label>}
            <details><summary>{item.title}<small>{item.kind === 'hypothetical' ? '教学假设' : '给定资料'}</small></summary><p>{item.content}</p><small>来源：{item.source}</small></details></div>)}
          {!current.evidence.length && <p>本场没有预置资料，可以在发言中说明你的依据与来源。</p>}
        </details>
        {v2 && <details className={styles.board} open><summary>论点板 <small>{ledger.length}</small></summary>{!ledger.length && <p className={styles.muted}>讨论开始后，这里会记录主张、质询和让步，可回到原发言核对。</p>}
          {ledger.map(move => <article key={move.id}><span>{moveLabels[move.kind]} · {roleName(move.speakerId)}</span><a href={`#${move.id.replace(/-m\d+$/, '')}`}>{move.text}</a>
            {move.targetId && <small>回应：{ledger.find(other => other.id === move.targetId)?.text || '相关论点'}</small>}
            {!review && attempt?.status === 'ACTIVE' && <button disabled={locked} onClick={() => {updateDraft({intent: 'challenge', targetSpeakerId: move.speakerId, message: `关于“${move.text}”，我想追问：`}); document.getElementById('debate-message')?.focus();}}>追问此论点</button>}</article>)}
        </details>}
        <details><summary>学习评价依据</summary>{current.rubric.map(item => <p key={item.id}><strong>{item.title}</strong><br />{item.description}</p>)}<p className={styles.muted}>评价论证过程；有根据地改变立场同样有价值。</p></details>
      </aside>
      <section className={styles.conversation} aria-label="辩论对话">
        {!attempt && !review && <section className={styles.setup}>
          <h2>{v2 ? '带着你的判断，加入讨论。' : '先提出你的看法，让 AI 来回应。'}</h2>
          <p>{v2 ? '你可以提出观点、指定角色回应、引用资料或追问前提。也可以先听角色交锋，再决定是否改变判断。' : `完成 ${current.rounds.length} 轮对练，每轮学生发言后 AI 回应。`}</p>
          <div className={styles.sides}>{(v2 ? ['pro', 'con', 'neutral'] as const : ['pro', 'con'] as const).map(value => <button key={value} aria-pressed={side === value} onClick={() => {setSide(value); startKey.current = null;}} disabled={busy}>
            <strong>{sides[value]}</strong><span>{value === 'neutral' ? '先检验证据与各方理由，允许在讨论中形成判断。' : current.positions[value]}</span></button>)}</div>
          <button className={styles.primary} disabled={busy || loading} onClick={start}>{busy ? '正在准备…' : canReview ? '以学生视角试练' : '加入辩论'}</button>
        </section>}
        {!attempt && review && <p className={styles.setup}>还没有学生辩论记录。发布到课程后，学生可从课程内容入口参与。</p>}
        {attempt && <>
          <div className={styles.progress}><strong>{sides[attempt.side]}{round ? ` / ${round.title}` : ' / 复盘'}</strong><span>已进行 {attempt.turns.length} 次往返</span><progress aria-label="环节进度" value={phase} max={current.rounds.length} /></div>
          <ol className={styles.transcript}>{attempt.turns.map(turn => <li key={turn.id} id={turn.id}>
            <h3>{current.rounds[turn.round]?.title} <span>第 {attempt.turns.indexOf(turn) + 1} 次往返</span></h3>
            <article className={styles.student}><strong>{review ? attempt.studentName : '你'} / {DEBATE_INTENTS[turn.intent || 'respond']}</strong><p>{turn.student}</p>
              {!!turn.evidenceIds?.length && <small>引用：{turn.evidenceIds.map(id => current.evidence.find(item => item.id === id)?.title).join('、')}</small>}</article>
            {turn.reply.voices?.length ? turn.reply.voices.map(voice => <article key={voice.speakerId} className={styles.opponent}><strong>{roleName(voice.speakerId)}</strong><p>{voice.content}</p>
              {voice.evidenceIds.map(id => <details key={id} className={styles.citations}><summary>{current.evidence.find(item => item.id === id)?.title}</summary><p>{current.evidence.find(item => item.id === id)?.content}</p></details>)}</article>) :
              <article className={styles.opponent}><strong>AI 对手</strong><p className={styles.muted}>{turn.reply.acknowledgement}</p><p>{turn.reply.argument}</p></article>}
            {(turn.reply.moderator || turn.reply.question) && <div className={styles.moderator}><strong>{v2 ? '主持人' : '继续思考'}</strong><p>{turn.reply.moderator}</p><p>{turn.reply.question}</p></div>}
            {turn.reply.coaching.feedback && <details className={styles.coach} open={v2?.rules.coaching === 'always'}><summary>论证教练的建议</summary>{turn.reply.coaching.quote && <blockquote>{turn.reply.coaching.quote}</blockquote>}<p>{turn.reply.coaching.feedback}</p></details>}
          </li>)}</ol>
          {!review && attempt.status !== 'COMPLETED' && <form className={styles.composer} onSubmit={event => {event.preventDefault(); void submit();}}>
            <h2>{reflecting ? '形成你的反思' : `轮到你了：${round?.title}`}</h2>
            {reflecting ? <ul>{current.reflectionPrompts.map(item => <li key={item}>{item}</li>)}</ul> : <p>{round?.task}</p>}
            {v2 && !reflecting && <>
              <div className={styles.intents} aria-label="发言方式">{(['respond', 'challenge', 'evidence', ...(v2.rules.allowFollowUps ? ['follow-up'] : [])] as DebateIntent[]).map(value => <button key={value} type="button" aria-pressed={intent === value} disabled={locked} onClick={() => updateDraft({intent: value})}>{DEBATE_INTENTS[value]}</button>)}</div>
              <label>回应对象 <select value={target} disabled={locked} onChange={e => updateDraft({targetSpeakerId: e.target.value})} aria-label="回应对象"><option value="">由主持人邀请角色</option>{v2.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              {'prompts' in (round || {}) && (round as typeof v2.rounds[number]).prompts.length > 0 && <details className={styles.promptList}><summary>可探索的问题</summary>{(round as typeof v2.rounds[number]).prompts.map(prompt => <button key={prompt} type="button" disabled={locked} onClick={() => updateDraft({message: prompt})}>{prompt}</button>)}</details>}
            </>}
            <label htmlFor="debate-message">{reflecting ? '我的学习反思' : '我的发言'}{evidenceIds.length > 0 && !reflecting && <small>，已选 {evidenceIds.length} 条资料</small>}</label>
            <textarea id="debate-message" value={message} maxLength={v2 ? 12000 : 3000} disabled={locked} onChange={e => updateDraft({message: e.target.value})} rows={5} placeholder={reflecting ? '我的判断发生了什么变化？哪些证据仍不足？我会怎样继续验证？' : intent === 'follow-up' ? '继续追问当前环节，不切换话题…' : '写下你的判断、依据，或对某个具体观点的疑问…'} />
            <div className={styles.composeActions}><button type="button" onClick={() => setHint(!hint)}>思路提示</button><span>{message.length} 字</span><button className={styles.primary} disabled={locked || !message.trim()}>{locked ? '正在生成回应…' : reflecting ? '提交反思并生成反馈' : pending.current ? '重试这次发言' : '发送发言'}</button></div>
            {v2 && !reflecting && <div className={styles.secondaryActions}><button type="button" disabled={locked} onClick={() => {pending.current = null; void submit('listen');}}>{target ? '请该角色补充观点' : '邀请角色交锋'}</button><button type="button" disabled={locked} onClick={() => {pending.current = null; void submit('advance');}}>收束并进入下一环节</button>
              {v2.rules.allowEarlyFinish && attempt.turns.length > 0 && <button type="button" disabled={locked} onClick={() => updateDraft({earlyFinish: true, message: ''})}>结束并复盘</button>}</div>}
            {earlyFinish && attempt.status === 'ACTIVE' && <button type="button" disabled={locked} onClick={() => updateDraft({earlyFinish: false, message: ''})}>返回讨论</button>}
            {locked && <p role="status">正在结合当前资料和对话生成回应。已完成的对话会保留。</p>}
            {hint && <div className={styles.notice}>说明主张与证据之间的理由；找出对方最强的反例；提出愿意改变判断的条件。{intent === 'follow-up' && ' 本次追问会留在当前环节。'}</div>}
          </form>}
          {attempt.report && <section className={styles.report}><span className={styles.format}>学习复盘，供师生共同核对</span><h2>哪些问题，你想得更深了？</h2><p>{attempt.report.summary}</p>
            <details open id="reflection"><summary>我的反思</summary><p>{attempt.reflection}</p></details>
            <div className={styles.criteria}>{attempt.report.criteria.map(item => <article key={item.rubricId}><h3>{current.rubric.find(r => r.id === item.rubricId)?.title}<span>{levels[item.level]}</span></h3><p>{item.feedback}</p>{item.studentQuotes?.map((quote, index) => <blockquote key={index}>“{quote.quote}”</blockquote>)}<div>{item.evidenceTurnIds.map(id => <a key={id} href={`#${id}`}>{id === 'reflection' ? '回看反思' : `回看第 ${attempt.turns.findIndex(t => t.id === id) + 1} 次往返`}</a>)}</div></article>)}</div>
            <h3>下一步学习</h3><ul>{attempt.report.nextSteps.map(item => <li key={item}>{item}</li>)}</ul>
            {!review && <button className={styles.primary} onClick={() => {setSelectedId(null); setSide(attempt.side === 'pro' ? 'con' : 'pro');}}>换个立场，再练一次</button>}
          </section>}
        </>}
      </section>
    </div>
  </main>;
}
