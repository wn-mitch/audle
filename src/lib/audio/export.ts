import * as Tone from 'tone';
import { sampleById } from '../data/samples';
import { shortestSemitoneInterval } from '../domain/challenge';
import { TICKS_PER_QUARTER, type CompositionV1, type TrackControls } from '../domain/model';
import type { PerformanceV1 } from '../domain/performance';

const secondsFor = (ticks: number, bpm: number): number => (ticks * 60) / (TICKS_PER_QUARTER * bpm);

const asWav = (buffer: AudioBuffer): Blob => {
  const channels = Math.min(2, buffer.numberOfChannels);
  const bytes = new ArrayBuffer(44 + buffer.length * channels * 2);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes.byteLength - 44, true);
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let index = 0; index < buffer.length; index += 1) {
    for (const channel of data) {
      const sample = Math.max(-1, Math.min(1, channel![index]!));
      view.setInt16(offset, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
};

/** Render the same sources and control automation used during live playback. */
export const renderWav = async (
  composition: CompositionV1,
  performance?: PerformanceV1,
): Promise<Blob> => {
  const source = performance?.composition ?? composition;
  const durationTicks = performance?.durationTicks ?? source.bars * 384;
  const buffers = new Map(
    await Promise.all(
      source.challenge.sampleIds.map(async (id) => {
        const sample = sampleById(id);
        if (!sample) throw new Error('A sound is missing from this kit.');
        return [id, await Tone.ToneAudioBuffer.fromUrl(sample.url)] as const;
      }),
    ),
  );
  const effects: Array<Tone.Distortion | Tone.Reverb | Tone.FeedbackDelay> = [];
  const reverbs: Tone.Reverb[] = [];
  try {
    const result = await Tone.Offline(
      (offlineContext) => {
        const { transport } = offlineContext;
        transport.PPQ = TICKS_PER_QUARTER;
        transport.bpm.value = source.challenge.bpm;
        const limiter = new Tone.Limiter({
          context: offlineContext,
          threshold: -1,
        }).toDestination();
        const controls = new Map(source.tracks.map((track) => [track.id, { ...track.controls }]));
        const gains = new Map<string, Tone.Gain>();
        const setGains = (time: number) => {
          const soloed = [...controls.values()].some((value) => value.solo);
          for (const [id, value] of controls) {
            gains
              .get(id)
              ?.gain.setValueAtTime(
                value.muted || (soloed && !value.solo) ? 0 : 10 ** (value.gainDb / 20),
                time,
              );
          }
        };
        for (const track of source.tracks) {
          const filter = new Tone.Filter({
            context: offlineContext,
            type: 'lowpass',
            frequency: track.controls.cutoffHz,
          });
          const panner = new Tone.Panner({ context: offlineContext, pan: track.controls.pan });
          const gain = new Tone.Gain({ context: offlineContext });
          const trackEffects: Array<Tone.Distortion | Tone.Reverb | Tone.FeedbackDelay> = [];
          if (track.controls.fuzz > 0) {
            const fuzz = new Tone.Distortion({
              context: offlineContext,
              distortion: track.controls.fuzz,
              oversample: '2x',
              wet: 1,
            });
            trackEffects.push(fuzz);
            effects.push(fuzz);
          }
          if (track.controls.space > 0) {
            const space = new Tone.Reverb({
              context: offlineContext,
              decay: 2.8,
              preDelay: 0.015,
              wet: track.controls.space,
            });
            trackEffects.push(space);
            effects.push(space);
            reverbs.push(space);
          }
          if (track.controls.echo > 0) {
            const echo = new Tone.FeedbackDelay({
              context: offlineContext,
              delayTime: '8n',
              feedback: 0.35,
              wet: track.controls.echo,
            });
            trackEffects.push(echo);
            effects.push(echo);
          }
          filter.chain(panner, ...trackEffects, gain, limiter);
          const sample = sampleById(track.sampleId);
          const buffer = buffers.get(track.sampleId);
          if (!sample || !buffer) continue;
          for (let tick = 0; tick < durationTicks; tick += source.bars * 384) {
            for (const clip of track.clips) {
              const startTick = tick + clip.startTick;
              if (startTick >= durationTicks) continue;
              if (clip.kind === 'loop' && sample.kind === 'loop' && sample.sourceBpm) {
                const player = new Tone.GrainPlayer({
                  context: offlineContext,
                  url: buffer,
                  loop: true,
                  grainSize: 0.1,
                  overlap: 0.02,
                });
                const normalized = sample.rootPitchClass
                  ? shortestSemitoneInterval(sample.rootPitchClass, source.challenge.key.root)
                  : 0;
                player.playbackRate = source.challenge.bpm / sample.sourceBpm;
                player.detune = (normalized + track.controls.tuneSemitones) * 100;
                player.connect(filter);
                const length = secondsFor(
                  Math.min(clip.lengthTicks, durationTicks - startTick),
                  source.challenge.bpm,
                );
                const offset = secondsFor(clip.sourceOffsetTick, sample.sourceBpm);
                transport.scheduleOnce((time) => {
                  player.start(time, offset, length);
                  player.stop(time + length);
                }, `${startTick}i`);
              } else if (clip.kind === 'hit' && sample.kind === 'one-shot') {
                const interval = secondsFor(24 / clip.ratchet, source.challenge.bpm);
                for (let strike = 0; strike < clip.ratchet; strike += 1) {
                  const player = new Tone.Player({ context: offlineContext, url: buffer });
                  player.playbackRate = 2 ** (track.controls.tuneSemitones / 12);
                  player.connect(filter);
                  transport.scheduleOnce(
                    (time) => player.start(time + strike * interval),
                    `${startTick}i`,
                  );
                }
              }
            }
          }
        }
        setGains(0);
        for (const event of performance?.events ?? []) {
          transport.scheduleOnce((time) => {
            const value = controls.get(event.trackId) as TrackControls | undefined;
            if (!value) return;
            value[event.kind === 'mute' ? 'muted' : 'solo'] = event.value;
            setGains(time);
          }, `${event.tick}i`);
        }
        transport.start();
        return Promise.all(reverbs.map((reverb) => reverb.ready)).then(() => undefined);
      },
      secondsFor(durationTicks, source.challenge.bpm),
      2,
      44100,
    );
    const audio = result.get();
    if (!audio) throw new Error('Audio rendering returned no buffer.');
    return asWav(audio);
  } finally {
    for (const effect of effects) effect.dispose();
    for (const buffer of buffers.values()) buffer.dispose();
  }
};
