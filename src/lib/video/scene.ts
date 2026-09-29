import { sampleById } from '../data/samples';
import {
  TICKS_PER_BAR,
  TICKS_PER_QUARTER,
  TICKS_PER_SIXTEENTH,
  type CompositionV1,
} from '../domain/model';
import type { PerformanceV1 } from '../domain/performance';
import type { FramePainter } from './export';

const SIZE = 720;
const LEFT = 32;
const TILE_TOP = 66;
const TILE_WIDTH = 156;
const TILE_HEIGHT = 124;
const TILE_GAP = 11;
const STRIP_TOP = 609;
const STRIP_LEFT = 40;
const STRIP_WIDTH = 640;
const STRIP_ROW_HEIGHT = 5;

export interface VideoPalette {
  source: string[];
  deck: string;
  control: string;
  outline: string;
  text: string;
  muted: string;
  accent: string;
}

/** Read CSS colors once; every subsequent frame paints from this snapshot. */
export const videoPalette = (): VideoPalette => {
  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => style.getPropertyValue(`--audle-${name}`).trim();
  return {
    source: Array.from({ length: 16 }, (_, index) => `oklch(${color(`source-${index + 1}`)})`),
    deck: color('deck'),
    control: color('control'),
    outline: color('outline-subtle'),
    text: color('text'),
    muted: color('text-muted'),
    accent: color('accent'),
  };
};

const drawGlyph = (ctx: CanvasRenderingContext2D, index: number, x: number, y: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2.6;
  const circle = (radius: number) => {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  };
  const diamond = (size: number) => {
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size);
    ctx.lineTo(-size, 0);
    ctx.closePath();
    ctx.stroke();
  };
  switch (Math.floor(index / 2)) {
    case 0:
      circle(28);
      circle(18);
      circle(7);
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 1:
      for (const angle of [-0.5, 0.6]) {
        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, 28, 10, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      circle(7);
      break;
    case 2:
      diamond(27);
      diamond(16);
      break;
    case 3:
      for (const [i, height] of [18, 27, 19, 12].entries()) {
        ctx.beginPath();
        ctx.ellipse(-25 + i * 16, 0, 7, height, 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case 4:
      for (const [dx, dy] of [
        [0, -17],
        [-17, 0],
        [17, 0],
        [0, 17],
      ]) {
        ctx.save();
        ctx.translate(dx, dy);
        diamond(12);
        ctx.restore();
      }
      break;
    case 5:
      for (const [i, height] of [19, 37, 28, 46].entries())
        ctx.fillRect(-27 + i * 17, -height / 2, 7, height);
      break;
    case 6:
      for (const angle of [-0.8, 0.8]) {
        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, 30, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      circle(5);
      break;
    default:
      for (const angle of [0.26, 1.05]) {
        ctx.save();
        ctx.rotate(angle);
        ctx.strokeRect(-23, -23, 46, 46);
        ctx.restore();
      }
      diamond(11);
      circle(3);
  }
  ctx.restore();
};

export interface VideoFrameState {
  cursor: number;
  tiles: { sampleId: string; active: boolean; accent: boolean; ticks: number[] }[];
}

export interface VideoScene {
  stateAt: (tick: number) => VideoFrameState;
  draw: (context: CanvasRenderingContext2D, tick: number) => void;
}

export const createVideoScene = (
  composition: CompositionV1,
  performance: PerformanceV1 | undefined,
  palette: VideoPalette,
): VideoScene => {
  const durationTicks = performance?.durationTicks ?? composition.bars * TICKS_PER_BAR;
  const repeatTicks = composition.bars * TICKS_PER_BAR;
  const trackIndex = new Map(composition.tracks.map((track, index) => [track.id, index]));
  const tracksByPad = composition.challenge.sampleIds.map((sampleId) =>
    composition.tracks.flatMap((track, index) =>
      track.sampleId === sampleId && track.clips.length ? [index] : [],
    ),
  );
  const starts = composition.tracks.map((track) => {
    const ticks: number[] = [];
    for (let repeat = 0; repeat < durationTicks; repeat += repeatTicks) {
      for (const clip of track.clips) {
        const start = repeat + clip.startTick;
        if (start >= durationTicks) continue;
        if (clip.kind === 'loop') ticks.push(start);
        else
          for (let strike = 0; strike < clip.ratchet; strike++) {
            const tick = start + (strike * TICKS_PER_SIXTEENTH) / clip.ratchet;
            if (tick < durationTicks) ticks.push(tick);
          }
      }
    }
    return ticks;
  });
  const startsByPad = tracksByPad.map((members) =>
    members.flatMap((index) => starts[index]!).sort((a, b) => a - b),
  );
  const accentTicks = (80 * TICKS_PER_QUARTER * composition.challenge.bpm) / 60_000;

  const stateAt = (tick: number) => {
    const muted = composition.tracks.map((track) => track.controls.muted);
    const solo = composition.tracks.map((track) => track.controls.solo);
    for (const event of performance?.events ?? []) {
      if (event.tick > tick) break;
      const index = trackIndex.get(event.trackId);
      if (index === undefined) continue;
      if (event.kind === 'mute') muted[index] = event.value;
      else solo[index] = event.value;
    }
    const anySolo = solo.some(Boolean);
    const audible = composition.tracks.map(
      (_, index) => !muted[index] && (!anySolo || solo[index]),
    );
    return {
      cursor: Math.max(0, Math.min(1, tick / durationTicks)),
      tiles: tracksByPad.map((members, index) => ({
        sampleId: composition.challenge.sampleIds[index]!,
        active: members.some((member) => audible[member]),
        accent: members.some(
          (member) =>
            audible[member] &&
            starts[member]!.some((start) => start <= tick && tick - start < accentTicks),
        ),
        ticks: startsByPad[index]!,
      })),
    };
  };

  const draw = (ctx: CanvasRenderingContext2D, tick: number) => {
    const frame = stateAt(tick);
    ctx.fillStyle = palette.deck;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = palette.text;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillText('AUDLE', LEFT, 39);
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.fillStyle = palette.muted;
    ctx.textAlign = 'right';
    ctx.fillText(performance ? 'LIVE TAKE' : 'YOUR LOOP', SIZE - LEFT, 37);
    ctx.textAlign = 'left';

    for (let index = 0; index < frame.tiles.length; index++) {
      const tile = frame.tiles[index]!;
      const x = LEFT + (index % 4) * (TILE_WIDTH + TILE_GAP);
      const y = TILE_TOP + Math.floor(index / 4) * (TILE_HEIGHT + TILE_GAP);
      const color = palette.source[index]!;
      ctx.fillStyle = palette.control;
      ctx.fillRect(x, y, TILE_WIDTH, TILE_HEIGHT);
      if (tile.active) {
        ctx.save();
        ctx.globalAlpha = tile.accent ? 0.3 : 0.14;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, TILE_WIDTH, TILE_HEIGHT);
        ctx.restore();
      }
      ctx.strokeStyle = tile.active ? color : palette.outline;
      ctx.lineWidth = tile.active ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE_WIDTH - 1, TILE_HEIGHT - 1);
      ctx.fillStyle = tile.active ? color : palette.muted;
      ctx.strokeStyle = ctx.fillStyle;
      drawGlyph(ctx, index, x + TILE_WIDTH / 2, y + 51);
      ctx.fillStyle = palette.text;
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(sampleById(tile.sampleId)?.label ?? 'Sound', x + 11, y + 104, TILE_WIDTH - 20);
      ctx.fillStyle = palette.muted;
      ctx.font = '600 10px ui-monospace, monospace';
      ctx.fillText(String(index + 1).padStart(2, '0'), x + 11, y + 20);
    }

    ctx.fillStyle = palette.control;
    ctx.fillRect(LEFT, STRIP_TOP, SIZE - LEFT * 2, 95);
    for (let index = 0; index < frame.tiles.length; index++) {
      const row = STRIP_TOP + 8 + index * STRIP_ROW_HEIGHT;
      ctx.fillStyle = palette.outline;
      ctx.fillRect(STRIP_LEFT, row, STRIP_WIDTH, 1);
      ctx.fillStyle = palette.source[index]!;
      for (const start of frame.tiles[index]!.ticks) {
        ctx.fillRect(STRIP_LEFT + (start / durationTicks) * STRIP_WIDTH, row - 1, 2, 3);
      }
    }
    ctx.fillStyle = palette.accent;
    ctx.fillRect(STRIP_LEFT + frame.cursor * STRIP_WIDTH - 1, STRIP_TOP + 4, 2, 86);
  };
  return { stateAt, draw };
};

/** The encoder passes its frozen composition, so late editor changes cannot alter the scene. */
export const createVideoPainter = (): FramePainter => {
  const palette = videoPalette();
  let lastComposition: CompositionV1 | undefined;
  let lastPerformance: PerformanceV1 | undefined;
  let scene: VideoScene;
  return (context, composition, performance, tick) => {
    if (composition !== lastComposition || performance !== lastPerformance) {
      scene = createVideoScene(composition, performance, palette);
      lastComposition = composition;
      lastPerformance = performance;
    }
    scene.draw(context, tick);
  };
};
