import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UsePronunciationResult = {
  supported: boolean;
  isSpeaking: boolean;
  speakingWord: string | null;
  message: string | null;
  pronounce: (word: string) => void;
  stop: () => void;
};

const ENGLISH_PREFIX = "en";

export function usePronunciation(): UsePronunciationResult {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const [supported, setSupported] = useState(false);
  const [speakingWord, setSpeakingWord] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const hasSupport =
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window;
    setSupported(hasSupport);
    synthRef.current = hasSupport ? window.speechSynthesis : null;
  }, []);

  const stop = useCallback(() => {
    synthRef.current?.cancel();
    setSpeakingWord(null);
  }, []);

  const pronounce = useCallback(
    (word: string) => {
      if (!supported || !synthRef.current) {
        setMessage("当前浏览器不支持发音功能。");
        return;
      }

      const synth = synthRef.current;
      synth.cancel();
      setMessage(null);

      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = "en-US";
      utterance.rate = 0.94;
      utterance.pitch = 1;

      const voices = synth.getVoices();
      const englishVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith(ENGLISH_PREFIX));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      utterance.onstart = () => setSpeakingWord(word);
      utterance.onend = () => setSpeakingWord(null);
      utterance.onerror = () => {
        setSpeakingWord(null);
        setMessage("发音暂时不可用，请稍后重试。");
      };

      synth.speak(utterance);
    },
    [supported]
  );

  const isSpeaking = useMemo(() => Boolean(speakingWord), [speakingWord]);

  return { supported, isSpeaking, speakingWord, message, pronounce, stop };
}
