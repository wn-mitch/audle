/// <reference types="vite/client" />

declare module '*.css';

interface Window {
  __audleDebug?: {
    audioState: () => AudioContextState;
    transportTick: () => number;
    outputRms: () => number;
    activeVoiceCount: () => number;
  };
}
