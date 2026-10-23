/** Built-in playback UI, not model state switches or mechanical operations. */
export const cinematicPlayerControlNames = [
  'play',
  'pause',
  'step',
  'seek',
  'reset',
  'speed',
  'quality',
  'fullscreen',
] as const;

export type CinematicPlayerControl = (typeof cinematicPlayerControlNames)[number];

export const cinematicPlayerControlIds: Record<CinematicPlayerControl, string> = {
  play: 'animation-toggle',
  pause: 'animation-toggle',
  step: 'animation-step',
  seek: 'animation-progress',
  reset: 'animation-reset',
  speed: 'playback-rate',
  quality: 'quality',
  fullscreen: 'cinema-fullscreen',
};
