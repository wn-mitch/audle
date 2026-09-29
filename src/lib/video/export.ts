import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { renderAudioBuffer } from '../audio/export';
import { TICKS_PER_BAR, TICKS_PER_QUARTER, type CompositionV1 } from '../domain/model';
import type { PerformanceV1 } from '../domain/performance';

const SIZE = 720;
const FRAME_RATE = 30;
const VIDEO_QUALITY = new Quality({ bitrate: 2_000_000 });
const AUDIO_QUALITY = new Quality({ bitrate: 160_000 });

export class UnsupportedVideoError extends Error {
  constructor() {
    super('This browser cannot encode H.264 video at 720 × 720. Download WAV instead.');
  }
}

export type FramePainter = (
  context: CanvasRenderingContext2D,
  composition: CompositionV1,
  performance: PerformanceV1 | undefined,
  tick: number,
  durationTicks: number,
) => void;

/** Render video frames from musical ticks and audio from the same immutable arrangement. */
export const renderMp4 = async (
  composition: CompositionV1,
  performance: PerformanceV1 | undefined,
  paintFrame: FramePainter,
): Promise<Blob> => {
  const snapshot = performance ? structuredClone(performance) : undefined;
  const source = snapshot?.composition ?? structuredClone(composition);
  const durationTicks = snapshot?.durationTicks ?? source.bars * TICKS_PER_BAR;
  const videoConfig = {
    width: SIZE,
    height: SIZE,
    frameRate: FRAME_RATE,
    quality: VIDEO_QUALITY,
  };
  if (!(await canEncodeVideo('avc', videoConfig))) throw new UnsupportedVideoError();

  const audio = await renderAudioBuffer(source, snapshot);
  if (
    !(await canEncodeAudio('aac', {
      numberOfChannels: audio.numberOfChannels,
      sampleRate: audio.sampleRate,
      quality: AUDIO_QUALITY,
    }))
  ) {
    // Native AAC is absent in some browsers; keep the WASM encoder out of the common bundle.
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('A 2D canvas is required to render video.');

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: 'avc', quality: VIDEO_QUALITY });
  const sound = new AudioBufferSource({ codec: 'aac', quality: AUDIO_QUALITY });
  output.addVideoTrack(video, { frameRate: FRAME_RATE });
  output.addAudioTrack(sound);
  try {
    await output.start();
    await sound.add(audio);
    sound.close();
    const duration = audio.length / audio.sampleRate;
    for (let frame = 0; frame / FRAME_RATE < duration; frame++) {
      const seconds = frame / FRAME_RATE;
      const tick = Math.min(
        durationTicks,
        (seconds * TICKS_PER_QUARTER * source.challenge.bpm) / 60,
      );
      paintFrame(context, source, snapshot, tick, durationTicks);
      await video.add(seconds, Math.min(1 / FRAME_RATE, duration - seconds));
    }
    video.close();
    await output.finalize();
    if (!output.target.buffer) throw new Error('Video encoding returned no file.');
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  } catch (error) {
    try {
      await output.cancel();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Video rendering and cleanup failed.', {
        cause: cleanupError,
      });
    }
    throw error;
  }
};
