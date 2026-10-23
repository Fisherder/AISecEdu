(function (scope) {
  'use strict';
  scope.CinematicTransport = function (duration) {
    if (!Number.isFinite(duration) || duration <= 0) throw Error('Invalid playback duration');
    const state = { time: 0, playing: false, rate: 1, scrubbing: false, ended: false };
    let previous = null;
    const resetClock = () => { previous = null; };
    const seek = (time) => {
      if (!Number.isFinite(time)) return;
      state.time = Math.max(0, Math.min(duration, time));
      state.ended = state.time === duration;
      if (state.ended && !state.scrubbing) state.playing = false;
      resetClock();
    };
    const pause = () => { state.playing = false; resetClock(); };
    const play = () => {
      if (state.ended) seek(0);
      state.playing = true;
      resetClock();
    };
    return {
      state, resetClock, seek, play, pause,
      toggle() { if (state.playing) pause(); else play(); },
      step(delta = 1 / 30) { pause(); seek(state.time + delta); },
      reset() { state.scrubbing = false; pause(); seek(0); },
      setRate(rate) {
        if (![0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].includes(rate)) return;
        state.rate = rate;
        resetClock();
      },
      beginScrub() { state.scrubbing = true; resetClock(); },
      endScrub() {
        state.scrubbing = false;
        if (state.ended) state.playing = false;
        resetClock();
      },
      tick(now) {
        if (!Number.isFinite(now)) return false;
        const elapsed = previous === null ? 0 : Math.max(0, (now - previous) / 1000);
        previous = now;
        if (!state.playing || state.scrubbing || elapsed === 0) return false;
        state.time = Math.min(duration, state.time + elapsed * state.rate);
        state.ended = state.time === duration;
        if (state.ended) state.playing = false;
        return true;
      },
    };
  };
})(globalThis);
