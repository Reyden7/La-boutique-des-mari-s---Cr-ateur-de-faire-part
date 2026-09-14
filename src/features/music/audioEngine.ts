import type { ProjectAudioConfig } from "../../types/editor";
import { getAudioBlob } from "./mediaStorage";
import { getMusicTrack } from "./musicRegistry";

export interface AudioController {
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  setVolume: (value: number) => void;
  isPlaying: () => boolean;
}

const midiToFrequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

const createSynthController = async (trackId: string, volume: number, loop: boolean, fadeIn = 0): Promise<AudioController | null> => {
  const track = getMusicTrack(trackId);
  if (!track) return null;
  const context = new AudioContext();
  const secondsPerBeat = 60 / track.tempo;
  const noteDuration = secondsPerBeat * 1.8;
  const totalDuration = track.notes.length * secondsPerBeat;
  const sampleRate = 22050;
  const buffer = context.createBuffer(1, Math.ceil(totalDuration * sampleRate), sampleRate);
  const channel = buffer.getChannelData(0);
  track.notes.forEach((note, index) => {
    const start = Math.floor(index * secondsPerBeat * sampleRate);
    const length = Math.floor(noteDuration * sampleRate);
    const frequency = midiToFrequency(note);
    for (let sample = 0; sample < length && start + sample < channel.length; sample += 1) {
      const time = sample / sampleRate;
      const envelope = Math.min(1, time / 0.08) * Math.exp(-2.7 * time / noteDuration);
      const fundamental = Math.sin(2 * Math.PI * frequency * time);
      const overtone = 0.22 * Math.sin(2 * Math.PI * frequency * 2 * time);
      channel[start + sample] += (fundamental + overtone) * envelope * 0.24;
    }
  });
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = loop;
  source.connect(gain).connect(context.destination);
  gain.gain.setValueAtTime(fadeIn > 0 ? 0 : volume, context.currentTime);
  if (fadeIn > 0) gain.gain.linearRampToValueAtTime(volume, context.currentTime + fadeIn);
  source.start();
  let playing = true;
  source.onended = () => { playing = false; };
  return {
    pause: () => { void context.suspend(); playing = false; },
    resume: async () => { await context.resume(); playing = true; },
    stop: () => { try { source.stop(); } catch { /* already stopped */ } void context.close(); playing = false; },
    setVolume: (value) => gain.gain.setTargetAtTime(value, context.currentTime, 0.08),
    isPlaying: () => playing,
  };
};

const createUploadController = async (audioId: string, volume: number, loop: boolean, fadeIn = 0): Promise<AudioController | null> => {
  const blob = await getAudioBlob(audioId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.loop = loop;
  audio.volume = fadeIn > 0 ? 0 : volume;
  await audio.play();
  let fadeTimer: number | undefined;
  if (fadeIn > 0) {
    const startedAt = performance.now();
    fadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / (fadeIn * 1000));
      audio.volume = volume * progress;
      if (progress >= 1 && fadeTimer) window.clearInterval(fadeTimer);
    }, 60);
  }
  return {
    pause: () => audio.pause(),
    resume: () => audio.play(),
    stop: () => { audio.pause(); if (fadeTimer) window.clearInterval(fadeTimer); URL.revokeObjectURL(url); },
    setVolume: (value) => { audio.volume = value; },
    isPlaying: () => !audio.paused,
  };
};

const createRemoteUploadController = async (url: string, volume: number, loop: boolean, fadeIn = 0): Promise<AudioController> => {
  const audio = new Audio(url);
  audio.loop = loop;
  audio.volume = fadeIn > 0 ? 0 : volume;
  await audio.play();
  let fadeTimer: number | undefined;
  if (fadeIn > 0) {
    const startedAt = performance.now();
    fadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / (fadeIn * 1000));
      audio.volume = volume * progress;
      if (progress >= 1 && fadeTimer) window.clearInterval(fadeTimer);
    }, 60);
  }
  return {
    pause: () => audio.pause(),
    resume: () => audio.play(),
    stop: () => { audio.pause(); if (fadeTimer) window.clearInterval(fadeTimer); },
    setVolume: (value) => { audio.volume = value; },
    isPlaying: () => !audio.paused,
  };
};

export const createAudioController = async (config: ProjectAudioConfig, preview = false) => {
  if (!config.enabled || !config.source) return null;
  const fadeIn = preview ? 0.4 : (config.fadeInDuration ?? 0);
  if (config.source === "library" && config.trackId) return createSynthController(config.trackId, config.volume, preview ? false : config.loop, fadeIn);
  if (config.source === "upload" && config.uploadedAudioUrl) return createRemoteUploadController(config.uploadedAudioUrl, config.volume, preview ? false : config.loop, fadeIn);
  if (config.source === "upload" && config.uploadedAudioId) return createUploadController(config.uploadedAudioId, config.volume, preview ? false : config.loop, fadeIn);
  return null;
};

let activePreview: AudioController | null = null;

export const toggleAudioPreview = async (config: ProjectAudioConfig) => {
  activePreview?.stop();
  activePreview = await createAudioController({ ...config, enabled: true }, true);
  return activePreview;
};

export const stopAudioPreview = () => { activePreview?.stop(); activePreview = null; };
