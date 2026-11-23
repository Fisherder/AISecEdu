import { useCallback, useEffect, useRef, useState } from 'react';

// Short utterances keep long replies playable in browsers with per-utterance limits.
function spokenParts(text: string) {
  const segments = text.match(/[^。！？.!?\n]{1,160}[。！？.!?]*|[。！？.!?]+/gu) || [];
  return segments.map(segment => segment.trim()).filter(Boolean);
}

export function useReplySpeech(threadId: string | undefined, onError: (error: Error) => void) {
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const playback = useRef<{ messageId: number; utterance?: SpeechSynthesisUtterance } | null>(null);
  const supported = typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance === 'function';

  const stop = useCallback(() => {
    if (playback.current) {
      playback.current = null;
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
  }, []);
  useEffect(() => stop, [threadId, stop]);

  const toggle = (messageId: number, text: string) => {
    if (!supported) return;
    const wasPlaying = playback.current?.messageId === messageId;
    stop();
    if (wasPlaying) return;
    const parts = spokenParts(text);
    if (!parts.length) return;
    const synth = window.speechSynthesis;
    const voices = synth.getVoices().filter(voice => voice.localService);
    const language = /\p{Script=Han}/u.test(text) ? 'zh' : /[a-z]/i.test(text) ? 'en' : navigator.language;
    const voice = voices.find(item => item.lang.toLowerCase().startsWith(language.toLowerCase()))
      || voices.find(item => item.default) || voices[0];
    if (!voice) {
      onError(new Error('没有可用的本地朗读语音，请在设备的语音设置中启用。'));
      return;
    }

    const run: NonNullable<typeof playback.current> = { messageId };
    playback.current = run;
    setSpeakingId(messageId);
    const speak = (index: number) => {
      if (playback.current !== run) return;
      if (index >= parts.length) {
        stop();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(parts[index]);
      run.utterance = utterance;
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.onend = () => speak(index + 1);
      utterance.onerror = () => {
        if (playback.current !== run) return;
        stop();
        onError(new Error('朗读已中断，请重试。'));
      };
      synth.speak(utterance);
    };
    speak(0);
  };
  return { speakingId, supported, toggle, stop };
}
