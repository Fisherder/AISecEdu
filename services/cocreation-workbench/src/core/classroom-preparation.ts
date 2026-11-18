import type { Data, Message, Thread } from './types';

export interface ClassroomApprovalReference {
  id: string;
  sha256: string;
}

export function matchingClassroomDecision(reference: ClassroomApprovalReference, decision: Data | undefined) {
  return decision?.version === 1 && decision.requestId === reference.id &&
    decision.requestSha256 === reference.sha256 &&
    (decision.decision === 'APPROVED' || decision.decision === 'REJECTED');
}

export function classroomSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(value);
}

export function classroomPreparation(thread: Thread, message: Message, index: number) {
  const proposal = message.metadata.toolProposals?.[index];
  const reference = message.metadata.toolProposalApprovalRequests?.[String(index)];
  const args = proposal?.arguments;
  if (message.role !== 'assistant' || message.metadata.pending !== false ||
      thread.status !== 'ACTIVE' || !Number.isSafeInteger(thread.dojoId) ||
      proposal?.tool !== 'classroom.prepare' || proposal.requiresConfirmation !== true ||
      proposal.boundScope?.dojoId !== thread.dojoId ||
      proposal.boundScope?.moduleIndex !== (thread.moduleIndex ?? null) ||
      typeof args?.artifactId !== 'string' || !args.artifactId ||
      !Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 1 ||
      typeof args.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(args.contentHash) ||
      typeof reference?.id !== 'string' || !reference.id ||
      typeof reference.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(reference.sha256)) return null;
  const approval: ClassroomApprovalReference = { id: reference.id, sha256: reference.sha256 };
  const decision = message.metadata.toolProposalDecisions?.[String(index)];
  if (decision && !matchingClassroomDecision(approval, decision)) return null;
  const result = message.metadata.toolExecutionResults?.[String(index)];
  const sessionId = decision?.decision === 'APPROVED' && result?.tool === 'classroom.prepare' &&
    result.status === 'SUCCEEDED' && result.artifactId === args.artifactId &&
    result.artifactRevision === args.expectedRevision && classroomSessionId(result.sessionId)
    ? result.sessionId : null;
  return { approval, decision: decision?.decision as 'APPROVED' | 'REJECTED' | undefined,
    artifactId: args.artifactId as string, revision: args.expectedRevision as number, sessionId };
}

export function classroomDashboardLink(threadId: string, sessionId: string) {
  return '/teacher?' + new URLSearchParams({view:'dashboard', thread:threadId, classroom:sessionId});
}
