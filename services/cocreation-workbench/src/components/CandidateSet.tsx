import { useEffect, useState } from 'react';
import { useWorkbench } from '../core/context';
import { api, id } from '../core/api';
import type { Data } from '../core/types';
import { Button, Code, Dialog, Status } from './ui';

const candidateTitle = (candidate: Data) => candidate.title || candidate.content?.title || '生成成品';

function DebateDerivation({ candidateSetId, candidates, close }: {
  candidateSetId: string;
  candidates: Data[];
  close: () => void;
}) {
  const { controller: c, state } = useWorkbench();
  const [selected, setSelected] = useState<string[]>([]);
  const [instruction, setInstruction] = useState('');
  const [candidateCount, setCandidateCount] = useState(3);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ jobId: string; status: string; signature: string } | null>(null);
  const candidateIds = candidates.filter((candidate) => selected.includes(candidate.id)).map((candidate) => candidate.id);
  const body = { candidateIds, instruction: instruction.trim(), candidateCount };
  const signature = JSON.stringify(body);
  const job = receipt && state.jobs.find((item) => item.id === receipt.jobId);

  return (
    <details className="candidate-derive">
      <summary>从现有方案派生</summary>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!candidateIds.length || !body.instruction || receipt?.signature === signature) return;
        void c.run(async () => {
          setError('');
          try {
            const submitted = await c.deriveDebateCandidates(candidateSetId, body);
            setReceipt({ jobId: submitted.id, status: submitted.status, signature });
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : '无法提交派生任务，请重试。');
          }
        });
      }}>
        <fieldset disabled={state.busy}>
          <legend>选择一至四份参考方案</legend>
          {candidates.map((candidate) => (
            <label className="candidate-derive-option" key={candidate.id}>
              <input
                type="checkbox"
                checked={selected.includes(candidate.id)}
                disabled={selected.length >= 4 && !selected.includes(candidate.id)}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setSelected((current) => checked ? [...current, candidate.id] : current.filter((value) => value !== candidate.id));
                }}
              />
              {candidateTitle(candidate)}
            </label>
          ))}
        </fieldset>
        <label className="field">
          派生要求
          <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)}
            rows={3} maxLength={16000} required disabled={state.busy} />
        </label>
        <label className="field">
          新方案数量
          <select value={candidateCount} onChange={(event) => setCandidateCount(Number(event.target.value))}
            disabled={state.busy}>
            {[2, 3, 4].map((count) => <option key={count} value={count}>{count} 份</option>)}
          </select>
        </label>
        <Button type="submit" className="primary"
          disabled={state.busy || !candidateIds.length || !body.instruction || receipt?.signature === signature}>
          生成新辩论方案
        </Button>
        {error && <p className="candidate-derive-result" role="alert">{error}</p>}
        {receipt && (
          <div className="candidate-derive-result">
            <p role="status">派生任务已提交。<Status status={job?.status || receipt.status} /> 完成后可在任务中心查看辩论候选。</p>
            <Button onClick={() => {
              c.patch({ taskCenter: true });
              close();
            }}>打开任务中心</Button>
          </div>
        )}
      </form>
    </details>
  );
}

export function CandidateSet({ candidateSetId, close }: { candidateSetId: string; close: () => void }) {
  const { state, controller: c } = useWorkbench();
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api(`/candidate-sets/${id(candidateSetId)}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setData(result.candidateSet); })
      .catch((failure) => {
        if (!controller.signal.aborted) setLoadError(failure instanceof Error ? failure.message : '无法读取生成结果。');
      });
    return () => controller.abort();
  }, [candidateSetId]);
  const candidates: Data[] = data?.candidates || [];
  const nativeCourseware = data?.request?.generationReason === 'teacher_requested_native_courseware';
  const ordinaryDebate = data?.kind === 'debate' && !data.selfWorkspaceId &&
    data.request?.generationReason === 'teacher_requested_ordinary_debate';
  return (
    <Dialog title={nativeCourseware ? '选择课件方案' : '审阅生成成品'} onClose={close} wide>
      <div className="dialog-body">
        {loadError ? <p role="alert">{loadError}</p> : !data ? <p>正在读取…</p> : (
          candidates.map((candidate) => (
            <section key={candidate.id} className="candidate">
              <h3>{candidateTitle(candidate)}</h3>
              <p>{candidate.summary || candidate.content?.summary}</p>
              {candidate.validation?.status && <Status status={candidate.validation.status} />}
              <details>
                <summary>检查生成内容</summary>
                <Code value={candidate.content} />
              </details>
              <Button
                className="primary"
                disabled={state.busy}
                onClick={() =>
                  void c.run(async () => {
                    const result = await api(`/candidates/${id(candidate.id)}/materialize`, {
                      method: 'POST',
                      body: {},
                    });
                    await c.loadArtifacts();
                    if (result.artifact?.id) {
                      await c.openArtifact(result.artifact.id);
                      close();
                    }
                  })
                }
              >
                {nativeCourseware ? "生成课件" : "打开成品工作区"}
              </Button>
            </section>
          ))
        )}
        {ordinaryDebate && candidates.length > 0 && (
          <DebateDerivation candidateSetId={candidateSetId} candidates={candidates} close={close} />
        )}
      </div>
    </Dialog>
  );
}
