<script lang="ts">
  import { animate } from 'animejs';
  import { onMount } from 'svelte';
  import { DURATION, EASE } from '../motion/config';
  import { motion } from '../motion/preference.svelte';
  import type { EditorState } from '../state/editor.svelte';

  let { editor, trackId }: { editor: EditorState; trackId: string } = $props();
  const SIZE = 60;
  let canvas: HTMLCanvasElement;
  let halo: HTMLSpanElement;
  let context: CanvasRenderingContext2D | null = null;
  let ready = $state(false);
  let frame = 0;
  let pulse: ReturnType<typeof animate> | undefined;

  const paint = (live: boolean) => {
    if (!context) return;
    const samples = live ? editor.trackWaveform(trackId) : undefined;
    let peak = 0;
    if (samples) {
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    }
    const gain = peak < 0.0005 ? 0 : Math.min(1000, 4 / peak);
    context.clearRect(0, 0, SIZE, SIZE);
    context.globalAlpha = live ? 1 : 0.45;
    context.beginPath();
    for (let index = 0; index < 64; index += 1) {
      const angle = (index * Math.PI) / 32 - Math.PI / 2;
      const sample = samples?.[Math.floor((index * samples.length) / 64)] ?? 0;
      const radius = 24 + Math.max(-5, Math.min(5, sample * gain));
      const x = SIZE / 2 + Math.cos(angle) * radius;
      const y = SIZE / 2 + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.stroke();
  };

  const draw = () => {
    paint(true);
    frame = requestAnimationFrame(draw);
  };

  onMount(() => {
    context = canvas.getContext('2d');
    if (context) {
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = SIZE * ratio;
      canvas.height = SIZE * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.strokeStyle = getComputedStyle(canvas).color;
      context.lineWidth = 2;
      context.lineJoin = 'round';
      paint(false);
    }
    ready = true;
    const unsubscribe = editor.subscribeHits((hit) => {
      if (hit.trackId !== trackId || !editor.playing || !motion.allowed) return;
      pulse?.cancel();
      pulse = animate(halo, {
        scale: [0.9, 1.2],
        opacity: [0.65, 0],
        duration: DURATION.meterDecay,
        ease: EASE.release,
        composition: 'replace',
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      pulse?.cancel();
      unsubscribe();
    };
  });

  $effect(() => {
    if (!ready) return;
    if (editor.playing && motion.allowed && context) frame = requestAnimationFrame(draw);
    else {
      cancelAnimationFrame(frame);
      pulse?.cancel();
      paint(false);
      halo.style.removeProperty('opacity');
    }
    return () => cancelAnimationFrame(frame);
  });
</script>

<span
  class="pad-waveform pointer-events-none absolute top-1/2 left-1/2 size-[60px] -translate-1/2 max-[540px]:size-12"
  aria-hidden="true"
>
  <span
    class="wave-halo absolute inset-[6px] rounded-full border border-current opacity-0"
    bind:this={halo}
  ></span>
  <canvas class="block size-full text-inherit" bind:this={canvas} width={SIZE} height={SIZE}
  ></canvas>
</span>

<style>
  .pad-waveform {
    color: oklch(var(--source));
  }
</style>
