export const TICKS_PER_QUARTER = 96;
export const TICKS_PER_BAR = TICKS_PER_QUARTER * 4;
export const TICKS_PER_SIXTEENTH = TICKS_PER_QUARTER / 4;
/** Source loops the patterns assume when a sample does not declare its own length. */
export const DEFAULT_SOURCE_BARS = 2;
/** The longest source loop patterns may read from; longer sources are only played part way. */
export const MAX_SOURCE_BARS = 4;
export const MAX_SOURCE_TICKS = MAX_SOURCE_BARS * TICKS_PER_BAR;
export const DEFAULT_SOURCE_TICKS = DEFAULT_SOURCE_BARS * TICKS_PER_BAR;
export const SOURCES_PER_ROLE = 2;
export const SOURCES_PER_DAY = 16;
export const MAX_TRACKS = 24;
export const BASE_TRACKS = SOURCES_PER_DAY;
export const MAX_CLIPS = 512;

export const PITCH_CLASSES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export type PitchClass = (typeof PITCH_CLASSES)[number];
export type SampleKind = 'loop' | 'one-shot';
export type SampleRole = 'beat' | 'bass' | 'chord' | 'texture' | 'kick' | 'clap' | 'hat' | 'fx';
export type Mode = 'major' | 'minor';

export interface SampleAsset {
  id: string;
  label: string;
  kind: SampleKind;
  role: SampleRole;
  url: string;
  sourceBpm?: number;
  rootPitchClass?: PitchClass;
  mode?: Mode;
  /** How many bars the source file holds, which bounds how far patterns may read into it. */
  bars?: 1 | 2 | 4;
}

export interface ChallengeSnapshot {
  version: 1;
  date: string;
  seed: number;
  bpm: number;
  key: { root: PitchClass; mode: Mode };
  /** Two sounds per role, in `ROLES` order. */
  sampleIds: [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
}

export interface TrackControls {
  gainDb: number;
  pan: number;
  tuneSemitones: number;
  cutoffHz: number;
  muted: boolean;
  solo: boolean;
}

export interface LoopClip {
  id: string;
  kind: 'loop';
  startTick: number;
  lengthTicks: number;
  sourceOffsetTick: number;
}

export interface HitClip {
  id: string;
  kind: 'hit';
  startTick: number;
  ratchet: 1 | 2 | 3 | 4;
}

export type Clip = LoopClip | HitClip;

export interface Track {
  id: string;
  sampleId: string;
  label: string;
  controls: TrackControls;
  clips: Clip[];
}

export interface CompositionV1 {
  version: 1;
  challenge: ChallengeSnapshot;
  bars: 1 | 2 | 3 | 4;
  tracks: Track[];
}

/** How many ticks of source a sample holds, which bounds how far a loop clip may read into it. */
export const sourceTicks = (sample: Pick<SampleAsset, 'bars'> | undefined): number =>
  (sample?.bars ?? DEFAULT_SOURCE_BARS) * TICKS_PER_BAR;

export const DEFAULT_TRACK_CONTROLS: TrackControls = {
  gainDb: 0,
  pan: 0,
  tuneSemitones: 0,
  cutoffHz: 18000,
  muted: false,
  solo: false,
};
