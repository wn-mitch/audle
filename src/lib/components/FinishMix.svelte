<script lang="ts">
  import { renderWav } from '../audio/export';
  import type { EditorState } from '../state/editor.svelte';
  import type { PerformanceV1 } from '../domain/performance';

  let {
    editor,
    onBack,
    onShareLoop,
    onShareTake,
  }: {
    editor: EditorState;
    onBack: () => void;
    onShareLoop: () => void;
    onShareTake: (take: PerformanceV1) => void;
  } = $props();
  let exporting = $state(false);
  let exportError = $state('');
  const active = $derived(editor.composition.tracks.filter((track) => track.clips.length));
  const captureSeconds = $derived(
    editor.performance
      ? Math.round(
          (editor.performance.durationTicks * 60) /
            (96 * editor.performance.composition.challenge.bpm),
        )
      : 0,
  );

  const download = async (take = false) => {
    exporting = true;
    exportError = '';
    try {
      const blob = await renderWav(editor.composition, take ? editor.performance : undefined);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audle-${editor.challenge.date}-${take ? 'take' : 'loop'}.wav`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      exportError = 'The audio could not be rendered. Try again.';
    } finally {
      exporting = false;
    }
  };
</script>

<section class="finish" aria-labelledby="finish-title">
  <button class="back" type="button" onclick={onBack}>← Back to Play</button>
  <div class="finish-head">
    <span class="eyebrow">02 / FINISH YOUR AUDLE</span>
    <h1 id="finish-title">The loop is yours.<br /><em>Make it a moment.</em></h1>
    <p>Your loop stays editable. Record a live take by switching sounds on and off as it plays.</p>
  </div>
  <div class="finish-grid">
    <section class="card" aria-labelledby="loop-title">
      <div class="card-index">01 <span>THE COMPOSITION</span></div>
      <h2 id="loop-title">Your loop</h2>
      <p>
        {active.length} sounds across {editor.composition.bars}
        {editor.composition.bars === 1 ? 'bar' : 'bars'}. Ready to play, share or download.
      </p>
      <div class="meter" aria-hidden="true">
        {#each editor.composition.tracks.slice(0, 8) as track, index (track.id)}<span
            class:lit={track.clips.length > 0 && !track.controls.muted}
            style={`--height:${[54, 76, 38, 92, 65, 43, 82, 58][index]}%`}
          ></span>{/each}
      </div>
      <div class="card-actions">
        <button
          type="button"
          disabled={editor.playingPerformance}
          onclick={() => void editor.togglePlayback()}
          >{editor.playing ? '■ Stop loop' : '▶ Play loop'}</button
        ><button type="button" onclick={onShareLoop}>↗ Share loop</button><button
          type="button"
          aria-label="Download loop WAV"
          disabled={exporting}
          onclick={() => void download()}>↓ Download WAV</button
        >
      </div>
    </section>
    <section class="card take" aria-labelledby="take-title">
      <div class="card-index">02 <span>THE PERFORMANCE</span></div>
      <h2 id="take-title">Live take</h2>
      <p>
        {editor.performance
          ? `${captureSeconds} seconds captured. Replay the changes you made, exactly as performed.`
          : 'Bring sounds in and out on the Play field. Capture that movement as a separate take.'}
      </p>
      <div class="take-state" aria-live="polite">
        <i class:recording={editor.captureStatus === 'recording'}></i>{editor.captureStatus ===
        'count-in'
          ? 'COUNTING IN · NEXT BAR'
          : editor.captureStatus === 'recording'
            ? 'RECORDING · TAP SOUNDS IN PLAY'
            : editor.performance
              ? 'TAKE SAVED'
              : 'READY TO RECORD'}
      </div>
      <div class="card-actions">
        {#if editor.captureStatus !== 'idle'}<button
            class="primary"
            type="button"
            onclick={() => editor.stopCapture()}
            >■ {editor.captureStatus === 'count-in' ? 'Cancel count-in' : 'Save take'}</button
          >
        {:else}<button
            class="primary"
            type="button"
            disabled={editor.playingPerformance}
            onclick={() => {
              onBack();
              void editor.startCapture();
            }}>{editor.performance ? '● Record new take' : '● Record a take'}</button
          >{/if}
        {#if editor.performance}<button type="button" onclick={() => void editor.playCapture()}
            >{editor.playingPerformance ? '■ Stop take' : '▶ Play take'}</button
          ><button type="button" onclick={() => onShareTake(editor.performance!)}
            >↗ Share take</button
          ><button
            type="button"
            aria-label="Download take WAV"
            disabled={exporting}
            onclick={() => void download(true)}>↓ Download WAV</button
          ><button
            class="quiet"
            type="button"
            disabled={editor.playingPerformance}
            onclick={() => editor.discardCapture()}>Discard take</button
          >{/if}
      </div>
    </section>
  </div>
  {#if exportError}<p class="error" role="alert">{exportError}</p>{/if}
  {#if exporting}<p class="rendering" role="status">Rendering audio in your browser…</p>{/if}
  <p class="footnote">
    No account needed. Your loop and take stay in this browser until you share them; a share link is
    kept on our server for 90 days.
  </p>
</section>

<style>
  .finish {
    inline-size: min(100% - 36px, 1100px);
    margin: 0 auto;
    padding: clamp(30px, 5vw, 64px) 0 64px;
  }
  .back {
    min-block-size: 44px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #a8cebb;
    cursor: pointer;
    font-weight: 700;
  }
  .finish-head {
    margin: 28px 0 38px;
  }
  .eyebrow,
  .card-index,
  .take-state,
  .footnote {
    font:
      700 0.7rem ui-monospace,
      monospace;
    letter-spacing: 0.09em;
  }
  .eyebrow {
    color: #9fe9bc;
  }
  .finish h1 {
    font-size: clamp(3.1rem, 7.8vw, 6.5rem);
    letter-spacing: -0.075em;
    line-height: 0.96;
    margin: 14px 0;
  }
  .finish h1 em {
    color: #9fe9bc;
    font-style: normal;
  }
  .finish-head p {
    max-inline-size: 550px;
    color: var(--audle-text-muted);
    line-height: 1.6;
  }
  .finish-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .card {
    display: flex;
    flex-direction: column;
    min-block-size: 420px;
    padding: clamp(20px, 3vw, 32px);
    border: 1px solid #47605a;
    background: #1b2b31;
    box-shadow: 0 18px 45px #0003;
  }
  .card.take {
    background: #22312d;
  }
  .card-index {
    display: flex;
    gap: 14px;
    color: #a9ead1;
  }
  .card-index span {
    color: #8aaba3;
  }
  .card h2 {
    margin: 35px 0 4px;
    font-size: 2.2rem;
    letter-spacing: -0.055em;
  }
  .card p {
    min-block-size: 50px;
    color: var(--audle-text-muted);
    font-size: 0.88rem;
    line-height: 1.5;
  }
  .meter {
    display: flex;
    align-items: center;
    gap: 8px;
    block-size: 72px;
    margin: 8px 0 26px;
  }
  .meter span {
    inline-size: 11%;
    block-size: var(--height);
    border: 1px solid #506760;
    background: #31443f;
  }
  .meter span.lit {
    background: #92d4b1;
  }
  .take-state {
    display: flex;
    align-items: center;
    gap: 10px;
    block-size: 72px;
    margin: 8px 0 26px;
    color: #b0d6c5;
  }
  .take-state i {
    inline-size: 11px;
    block-size: 11px;
    border-radius: 50%;
    background: #94d5b3;
  }
  .take-state i.recording {
    background: #f28d79;
    animation: blink 1s infinite alternate;
  }
  @keyframes blink {
    to {
      opacity: 0.35;
    }
  }
  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
  }
  .card-actions button {
    min-block-size: 46px;
    padding: 0 15px;
    border: 1px solid #6e9384;
    background: #254039;
    color: #eaf5ec;
    cursor: pointer;
    font-weight: 700;
  }
  .card-actions .primary {
    border-color: #a8e8bb;
    background: #a8e8bb;
    color: #13241c;
  }
  .card-actions .quiet {
    border-color: transparent;
    background: transparent;
    color: #aac6b8;
  }
  .card-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .error {
    color: #ffaf9e;
  }
  .rendering,
  .footnote {
    color: #9db4ab;
  }
  .footnote {
    margin-top: 26px;
    font-weight: 400;
  }
  @media (max-width: 740px) {
    .finish-grid {
      grid-template-columns: 1fr;
    }
    .card {
      min-block-size: 360px;
    }
    .finish {
      inline-size: min(100% - 24px, 600px);
    }
  }
</style>
