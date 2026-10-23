import type { CoursewarePage } from './schema';
import { sceneStateAt } from './compiler';

export type CoursewarePlayback = {
  step: number;
  selectedNode: string | null;
  selectedOption: string | null;
};
export type CoursewarePlaybackAction =
  | { type: 'next' | 'previous' | 'reset' }
  | { type: 'seek'; step: number }
  | { type: 'inspect'; nodeId: string | null }
  | { type: 'answer'; optionId: string | null };

export const initialCoursewarePlayback = (): CoursewarePlayback => ({
  step: -1,
  selectedNode: null,
  selectedOption: null,
});

export function consumeCoursewareNavigation(
  direction: 'next' | 'previous',
  root?: ParentNode | null,
): boolean {
  if (typeof document === 'undefined') return false;
  const player = (root || document).querySelector('[data-courseware-player]');
  return Boolean(
    player &&
    !player.dispatchEvent(
      new CustomEvent('courseware:navigate', { cancelable: true, detail: { direction } }),
    ),
  );
}

export function reduceCoursewarePlayback(
  page: CoursewarePage,
  state: CoursewarePlayback,
  action: CoursewarePlaybackAction,
): CoursewarePlayback {
  if (action.type === 'reset') return initialCoursewarePlayback();
  if (action.type === 'answer') {
    if (
      action.optionId === null ||
      page.check?.options.some((option) => option.id === action.optionId)
    )
      return { ...state, selectedOption: action.optionId };
    return state;
  }
  if (action.type === 'inspect') {
    if (
      action.nodeId === null ||
      (page.visual.kind === 'diagram' &&
        page.visual.nodes.some((node) => node.id === action.nodeId)) ||
      (page.visual.kind === 'scene' &&
        sceneStateAt(page, state.step).some(
          (object) => object.id === action.nodeId && object.detail && object.visible && object.opacity > 0,
        ))
    )
      return { ...state, selectedNode: action.nodeId };
    return state;
  }
  const target =
    action.type === 'seek' ? action.step : state.step + (action.type === 'next' ? 1 : -1);
  if (!Number.isFinite(target)) return state;
  return {
    ...state,
    step: Math.max(-1, Math.min(page.beats.length - 1, Math.floor(target))),
    selectedNode: null,
  };
}

export function coursewareStepState(index: number, step: number): 'pending' | 'current' | 'prior' {
  return index > step ? 'pending' : index === step ? 'current' : 'prior';
}
