<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ToneAudioEngine, type HitEvent } from './lib/audio/engine';
  import PlayStage from './lib/components/PlayStage.svelte';
  import FinishMix from './lib/components/FinishMix.svelte';
  import TutorialCoach from './lib/components/TutorialCoach.svelte';
  import JevJam from './lib/components/JevJam.svelte';
  import ListenGallery from './lib/components/ListenGallery.svelte';
  import PadBank from './lib/components/PadBank.svelte';
  import SelectionActions from './lib/components/SelectionActions.svelte';
  import SharedAudlePlayer from './lib/components/SharedAudlePlayer.svelte';
  import StatusNotice from './lib/components/StatusNotice.svelte';
  import TimelineEditor from './lib/components/TimelineEditor.svelte';
  import TransportBar from './lib/components/TransportBar.svelte';
  import TuningDeck from './lib/components/TuningDeck.svelte';
  import { examplesForChallenge, starterForChallenge } from './lib/data/examples';
  import { challengeForDate } from './lib/domain/challenge';
  import {
    ShareCodecError,
    decodeShared,
    encodeShare,
    encodePerformanceShare,
    fingerprintForComposition,
  } from './lib/domain/share-codec';
  import type { CompositionV1 } from './lib/domain/model';
  import type { PerformanceV1, SharedAudle } from './lib/domain/performance';
  import {
    loadFavorite,
    loadImports,
    loadTutorialComplete,
    saveFavorite,
    saveImport,
    saveTutorialComplete,
  } from './lib/state/persistence';
  import { EditorState } from './lib/state/editor.svelte';
  import { rise, watchMotionPreference } from './lib/motion';

  type View = 'maker' | 'listen' | 'shared' | 'tutorial';

  const today = new Date().toISOString().slice(0, 10);
  const challenge = challengeForDate(today);
  const engine = new ToneAudioEngine();
  const editor = new EditorState(engine, challenge);
  const examples = examplesForChallenge(challenge);

  let view = $state<View>('maker');
  let makerMode = $state<'play' | 'arrange' | 'finish'>('play');
  let tutorial = $state<EditorState | undefined>(undefined);
  let tutorialCanKeep = $state(false);
  let tutorialOffered = $state(false);
  let shared = $state<SharedAudle | undefined>(undefined);
  let sharedError = $state<string | undefined>(undefined);
  let sharedImported = $state<CompositionV1[]>([]);
  let sharedPicked = $state(false);
  let shareFallback = $state<string | undefined>(undefined);
  let shareInput = $state<HTMLInputElement | undefined>(undefined);
  let countdown = $state('');

  const makerHasClips = $derived(editor.composition.tracks.some((track) => track.clips.length > 0));

  const updateCountdown = () => {
    const next = new Date(`${today}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const remaining = Math.max(0, next.getTime() - Date.now());
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    countdown = `${hours}h ${minutes.toString().padStart(2, '0')}m to next kit`;
  };

  const refreshImports = () => {
    sharedImported = loadImports(challenge.date)
      .map((payload) => decodeShared(payload))
      .flatMap((result) => (result.ok ? [result.value.composition] : []));
  };

  const resetHash = () => {
    if (location.hash.startsWith('#audle='))
      history.replaceState(null, '', `${location.pathname}${location.search}`);
  };

  const leaveShared = (nextView: 'maker' | 'listen') => {
    editor.stopPlayback();
    shared = undefined;
    sharedError = undefined;
    resetHash();
    view = nextView;
    void editor.loadAudio();
  };
  const showMaker = (mode: 'play' | 'arrange' | 'finish') => {
    if (view !== 'maker') leaveShared('maker');
    if (mode === 'arrange') {
      if (editor.captureStatus !== 'idle') editor.stopCapture();
      if (editor.playingPerformance) editor.stopCapturePlayback();
    }
    makerMode = mode;
  };

  const openShared = (composition: CompositionV1) => {
    editor.stopPlayback();
    shared = { composition };
    sharedError = undefined;
    sharedPicked = false;
    view = 'shared';
    void fingerprintForComposition(composition).then((fingerprint) => {
      sharedPicked = loadFavorite(composition.challenge.date) === fingerprint;
    });
  };

  const readSharedFragment = () => {
    const fragment = location.hash;
    if (!fragment.startsWith('#audle=')) return;
    editor.stopPlayback();
    shareFallback = undefined;
    const payload = fragment.slice('#audle='.length);
    const result = decodeShared(payload);
    view = 'shared';
    if (!result.ok) {
      shared = undefined;
      // Links made before the kit grew to sixteen sources can no longer be rebuilt.
      sharedError =
        result.error === 'too-old'
          ? 'This link was made with an earlier version of Audle. Ask for a fresh one.'
          : 'This Audle link is damaged or from a newer version';
      return;
    }
    shared = result.value;
    sharedError = undefined;
    saveImport(result.value.composition.challenge.date, payload);
    refreshImports();
    void fingerprintForComposition(result.value.composition).then((fingerprint) => {
      sharedPicked = loadFavorite(result.value.composition.challenge.date) === fingerprint;
    });
  };

  const openListen = () => {
    editor.stopPlayback();
    resetHash();
    view = 'listen';
    refreshImports();
  };

  /** Asks `/api/share` to hold the payload behind a short link. Sharing falls back to the
   * self-contained `#audle=` link, so a share never depends on this endpoint. */
  const shortLinkFor = async (payload: string): Promise<string | undefined> => {
    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { url?: unknown };
      return typeof body.url === 'string' && body.url.startsWith(`${location.origin}/`)
        ? body.url
        : undefined;
    } catch {
      return undefined;
    }
  };

  const shareComposition = async (composition: CompositionV1, performance?: PerformanceV1) => {
    try {
      const payload = performance ? encodePerformanceShare(performance) : encodeShare(composition);
      const url =
        (await shortLinkFor(payload)) ?? `${location.origin}${location.pathname}#audle=${payload}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Audle', text: 'Play this Audle.', url });
          editor.notice = 'Your Audle is ready to share.';
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        editor.notice = 'Link copied. Send the beat.';
      } catch {
        shareFallback = url;
        await tick();
        shareInput?.focus();
        shareInput?.select();
      }
    } catch (error) {
      editor.notice =
        error instanceof ShareCodecError && error.code === 'too-long'
          ? 'This loop is too dense for a share link. Delete a few hits and try again.'
          : 'This Audle link could not be created.';
    }
  };

  const startTutorial = () => {
    editor.stopPlayback();
    tutorialCanKeep = !makerHasClips;
    tutorial = new EditorState(engine, challenge, starterForChallenge(challenge));
    view = 'tutorial';
    void tutorial.loadAudio();
  };

  const finishTutorial = (keep: boolean) => {
    const finished = tutorial;
    if (!finished) return;
    saveTutorialComplete();
    tutorialOffered = false;
    engine.stop();
    if (keep && tutorialCanKeep) editor.importComposition(finished.composition);
    finished.detach();
    tutorial = undefined;
    view = 'maker';
    void editor.loadAudio();
  };

  const playShared = async () => {
    if (!shared) return;
    if (editor.playing) {
      engine.stop();
      return;
    }
    try {
      engine.stop();
      await engine.loadChallenge(shared.composition.challenge);
      engine.setComposition(shared.composition);
      await engine.unlock();
      if (shared.performance) engine.playPerformance(shared.performance);
      else engine.play();
    } catch {
      sharedError = 'A sound for this shared Audle could not load. Try again.';
    }
  };

  const chooseSharedFavorite = async () => {
    if (!shared) return;
    const fingerprint = await fingerprintForComposition(shared.composition);
    if (!saveFavorite(shared.composition.challenge.date, fingerprint)) {
      editor.notice = 'Draft saving is unavailable in this browser';
      return;
    }
    sharedPicked = true;
  };

  onMount(() => {
    updateCountdown();
    const stopMotionWatch = watchMotionPreference();
    const clock = window.setInterval(updateCountdown, 30_000);
    tutorialOffered = !loadTutorialComplete();
    refreshImports();
    readSharedFragment();
    window.addEventListener('hashchange', readSharedFragment);
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      let hitCount = 0;
      let lastHit: HitEvent | undefined;
      engine.subscribeHits((hit) => {
        hitCount += 1;
        lastHit = hit;
      });
      window.__audleDebug = {
        audioState: () => engine.debug().audioState,
        transportTick: () => engine.debug().transportTick,
        outputRms: () => engine.debug().outputRms,
        activeVoiceCount: () => engine.debug().activeVoiceCount,
        hitCount: () => hitCount,
        lastHit: () => lastHit,
      };
    }
    if (view !== 'shared') void editor.loadAudio();
    return () => {
      window.clearInterval(clock);
      stopMotionWatch();
      window.removeEventListener('hashchange', readSharedFragment);
      tutorial?.detach();
      editor.destroy();
    };
  });
</script>

<svelte:head>
  <meta name="description" content="A daily music-making instrument." />
</svelte:head>

<main class="app-shell">
  <header class="deck-top">
    <button class="wordmark" type="button" onclick={() => showMaker('play')}>Audle</button>
    <div class="daily-readout">
      <strong>{challenge.date}</strong><span
        >{challenge.bpm} BPM · {challenge.key.root} {challenge.key.mode}</span
      ><small>{countdown}</small>
    </div>
    <nav aria-label="Audle views">
      <button
        aria-current={view === 'maker' && makerMode === 'play' ? 'page' : undefined}
        class:current={view === 'maker' && makerMode === 'play'}
        type="button"
        onclick={() => showMaker('play')}>Play</button
      >
      <button
        aria-current={view === 'maker' && makerMode === 'arrange' ? 'page' : undefined}
        class:current={view === 'maker' && makerMode === 'arrange'}
        type="button"
        onclick={() => showMaker('arrange')}>Arrange</button
      >
      <button
        aria-current={view === 'maker' && makerMode === 'finish' ? 'page' : undefined}
        class:current={view === 'maker' && makerMode === 'finish'}
        type="button"
        onclick={() => showMaker('finish')}>Finish</button
      >
      <button
        aria-current={view === 'listen' ? 'page' : undefined}
        class:current={view === 'listen'}
        type="button"
        onclick={openListen}>Listen</button
      >
      <button
        aria-current={view === 'tutorial' ? 'page' : undefined}
        class:current={view === 'tutorial'}
        type="button"
        onclick={startTutorial}>Help</button
      >
    </nav>
  </header>

  {#if view === 'maker'}
    {#if tutorialOffered}
      <section class="tutorial-offer" aria-label="Tutorial offer">
        <span>New here?</span><strong>Play with a ready-made beat.</strong><button
          type="button"
          onclick={startTutorial}>Start tutorial</button
        ><button
          class="quiet"
          type="button"
          onclick={() => {
            tutorialOffered = false;
            saveTutorialComplete();
          }}>Not now</button
        >
      </section>
    {/if}
    <StatusNotice message={editor.notice} onDismiss={() => (editor.notice = undefined)} />
    {#if makerMode === 'play'}
      <div class="view" in:rise>
        <PlayStage
          {editor}
          onArrange={() => showMaker('arrange')}
          onFinish={() => showMaker('finish')}
        />
      </div>
    {:else if makerMode === 'finish'}
      <div class="view" in:rise>
        <FinishMix
          {editor}
          onBack={() => showMaker('play')}
          onShareLoop={() => void shareComposition(editor.composition)}
          onShareTake={(take) => void shareComposition(take.composition, take)}
        />
      </div>
    {:else}
      <section class="maker-workspace" in:rise>
        <PadBank {challenge} {editor} />
        <div class="arrangement">
          {#if !makerHasClips && !editor.loading}
            <div class="empty-arrangement">
              <strong>Tap any sound.</strong><span
                >Click a lane to place a sound, let Jev jam a loop, or start with three open voices.</span
              >
              <div class="empty-actions">
                <button
                  disabled={editor.jamming}
                  type="button"
                  onclick={() => void editor.jamWithJev('')}>✦ Jam with Jev</button
                ><button
                  type="button"
                  onclick={() => editor.importComposition(starterForChallenge(challenge))}
                  >Remix today’s starter</button
                >
              </div>
            </div>
          {/if}
          <JevJam {editor} />
          <TimelineEditor {editor} />
          <div class="dock">
            <SelectionActions {editor} />
            <TransportBar {editor} onShare={() => void shareComposition(editor.composition)} />
          </div>
        </div>
        <TuningDeck {editor} />
      </section>
    {/if}
  {:else if view === 'tutorial' && tutorial}
    <TutorialCoach
      editor={tutorial}
      onShare={() => void shareComposition(tutorial!.composition)}
      onFinish={finishTutorial}
    />
    <section class="maker-workspace tutorial-workspace">
      <PadBank {challenge} editor={tutorial} />
      <div class="arrangement">
        <JevJam editor={tutorial} /><TimelineEditor editor={tutorial} />
        <div class="dock">
          <SelectionActions editor={tutorial} />
          <TransportBar
            editor={tutorial}
            onShare={() => void shareComposition(tutorial!.composition)}
          />
        </div>
      </div>
      <TuningDeck editor={tutorial} />
    </section>
  {:else if view === 'listen'}
    <div class="view" in:rise>
      <ListenGallery {examples} shared={sharedImported} onOpen={openShared} />
    </div>
  {:else if view === 'shared'}
    {#if shared}
      <div class="view" in:rise>
        <SharedAudlePlayer
          composition={shared.composition}
          performance={shared.performance}
          playing={editor.playing}
          picked={sharedPicked}
          onPlay={() => void playShared()}
          onPick={() => void chooseSharedFavorite()}
          onBack={() => leaveShared('maker')}
        />
      </div>
    {:else}
      <section class="shared-error" role="alert">
        <h1>That link did not open.</h1>
        <p>{sharedError ?? 'This Audle link is damaged or from a newer version'}</p>
        <button type="button" onclick={() => leaveShared('maker')}>Back to Make</button>
      </section>
    {/if}
  {/if}

  {#if shareFallback}
    <section class="share-fallback" aria-labelledby="share-fallback-title">
      <h2 id="share-fallback-title">Copy this link</h2>
      <input bind:this={shareInput} readonly value={shareFallback} /><button
        type="button"
        onclick={() => shareInput?.select()}>Select link</button
      ><button type="button" onclick={() => (shareFallback = undefined)}>Close</button>
    </section>
  {/if}
</main>

<style>
  .app-shell {
    min-block-size: 100dvh;
    background: var(--audle-page);
  }
  .deck-top {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    min-block-size: 74px;
    padding: 10px clamp(14px, 3vw, 36px);
    background: var(--audle-deck);
    border-block-end: 1px solid var(--audle-outline);
    box-shadow: var(--audle-deck-edge);
  }
  .wordmark {
    justify-self: start;
    border: 0;
    background: transparent;
    color: var(--audle-text);
    cursor: pointer;
    font-size: 1.55rem;
    font-weight: 800;
    letter-spacing: -0.05em;
  }
  .daily-readout {
    display: grid;
    justify-items: center;
    font-family: ui-monospace, monospace;
    text-align: center;
  }
  .daily-readout strong {
    font-size: 0.8rem;
  }
  .daily-readout span,
  .daily-readout small {
    color: var(--audle-text-muted);
    font-size: 0.65rem;
  }
  .daily-readout small {
    color: var(--audle-playback-light);
  }
  nav {
    display: flex;
    justify-self: end;
    gap: 4px;
  }
  nav button {
    min-block-size: 44px;
    padding-inline: 12px;
    border: 0;
    border-block-end: 2px solid transparent;
    background: transparent;
    color: var(--audle-text-muted);
    cursor: pointer;
    font-weight: 700;
  }
  nav button.current {
    color: var(--audle-text);
    border-color: var(--audle-playback-light);
  }
  .maker-workspace {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr) 260px;
    gap: 10px;
    padding: 10px;
  }
  .arrangement {
    position: relative;
    display: grid;
    align-content: start;
    gap: 10px;
    min-inline-size: 0;
  }
  /* Selection actions and transport stay in reach below sixteen lanes at every width. */
  .dock {
    position: sticky;
    inset-block-end: env(safe-area-inset-bottom, 0px);
    z-index: 10;
    display: grid;
    background: var(--audle-deck);
    box-shadow: 0 -8px 24px oklch(0.05 0.01 232 / 0.55);
  }
  .empty-arrangement {
    display: grid;
    justify-items: start;
    gap: 7px;
    padding: 16px;
    background: var(--audle-deck);
    border: 1px solid var(--audle-outline);
    box-shadow: var(--audle-deck-edge);
  }
  .empty-arrangement span {
    color: var(--audle-text-muted);
    font-size: 0.82rem;
  }
  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .empty-arrangement button,
  .tutorial-offer button,
  .shared-error button,
  .share-fallback button {
    min-block-size: 44px;
    padding-inline: 12px;
    border: 1px solid var(--audle-loop-light);
    background: var(--audle-loop-surface);
    color: var(--audle-text);
    cursor: pointer;
    font-weight: 700;
  }
  .tutorial-offer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 9px;
    margin: 10px;
    padding: 10px 14px;
    background: var(--audle-deck-raised);
    border: 1px solid var(--audle-outline);
  }
  .tutorial-offer span {
    color: var(--audle-playback-light);
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
  }
  .tutorial-offer .quiet {
    border-color: var(--audle-outline);
    background: var(--audle-control);
  }
  .shared-error,
  .share-fallback {
    inline-size: min(100% - 32px, 640px);
    margin: 12vh auto;
    padding: 28px;
    background: var(--audle-deck-raised);
    border: 1px solid var(--audle-record-light);
    box-shadow: inset 0 0 0 1px var(--audle-record-light);
  }
  .shared-error h1,
  .share-fallback h2 {
    margin-block-start: 0;
  }
  .shared-error p {
    color: var(--audle-text-muted);
  }
  .share-fallback {
    display: grid;
    gap: 10px;
    position: fixed;
    z-index: 20;
    inset: 0;
    margin: auto;
    block-size: max-content;
  }
  .share-fallback input {
    min-block-size: 44px;
    padding-inline: 8px;
    border: 1px solid var(--audle-outline);
    background: var(--audle-well);
    color: var(--audle-text);
  }
  @media (max-width: 959px) {
    .deck-top {
      grid-template-columns: 1fr auto;
    }
    .daily-readout {
      display: none;
    }
    .maker-workspace {
      grid-template-columns: minmax(0, 1fr);
    }
    .maker-workspace > :first-child {
      order: 0;
    }
    .arrangement {
      order: 1;
    }
    .maker-workspace > :last-child {
      order: 2;
    }
    .tutorial-workspace {
      padding-block-start: 0;
    }
  }
  @media (max-width: 540px) {
    .deck-top {
      min-block-size: 62px;
    }
    .wordmark {
      font-size: 1.35rem;
    }
    nav button {
      min-block-size: 44px;
      padding-inline: 8px;
      font-size: 0.8rem;
    }
    .maker-workspace {
      padding: 6px;
      gap: 6px;
    }
  }
  @media (max-width: 370px) {
    .deck-top {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      padding-inline: 12px;
    }
    nav {
      inline-size: 100%;
      justify-self: stretch;
      justify-content: space-between;
    }
    nav button {
      padding-inline: 5px;
      font-size: 0.75rem;
    }
  }
</style>
