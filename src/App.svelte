<script lang="ts">
  import { onMount } from 'svelte';
  import { ToneAudioEngine, type HitEvent } from './lib/audio/engine';
  import Icon from './lib/components/Icon.svelte';
  import JevJam from './lib/components/JevJam.svelte';
  import PadBank from './lib/components/PadBank.svelte';
  import PlayStage from './lib/components/PlayStage.svelte';
  import SelectionActions from './lib/components/SelectionActions.svelte';
  import SharedAudlePlayer from './lib/components/SharedAudlePlayer.svelte';
  import ShareSheet from './lib/components/ShareSheet.svelte';
  import StatusNotice from './lib/components/StatusNotice.svelte';
  import TimelineEditor from './lib/components/TimelineEditor.svelte';
  import TransportBar from './lib/components/TransportBar.svelte';
  import TuningDeck from './lib/components/TuningDeck.svelte';
  import TutorialCoach from './lib/components/TutorialCoach.svelte';
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
  import { press, rise, watchMotionPreference } from './lib/motion';
  import {
    loadFavorite,
    loadImports,
    saveFavorite,
    saveImport,
    saveTutorialComplete,
  } from './lib/state/persistence';
  import { EditorState } from './lib/state/editor.svelte';

  type View = 'maker' | 'shared' | 'tutorial';

  /** The kit changes at the maker's local midnight, so the day is read in local time. */
  const localDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = localDate(new Date());
  const challenge = challengeForDate(today);
  const engine = new ToneAudioEngine();
  const editor = new EditorState(engine, challenge);
  const examples = examplesForChallenge(challenge);
  const EXAMPLE_NAMES = ['Four on the floor', 'Syncopated', 'Four-bar build'];
  const TAKE_SAVED = 'Take saved.';
  const kitLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${today}T12:00:00`));

  let view = $state<View>('maker');
  let makerMode = $state<'play' | 'arrange'>('play');
  let tutorial = $state<EditorState | undefined>(undefined);
  let tutorialCanKeep = $state(false);
  let shared = $state<SharedAudle | undefined>(undefined);
  let sharedError = $state<string | undefined>(undefined);
  let sharedImported = $state<CompositionV1[]>([]);
  let sharedPicked = $state(false);
  let shareOpen = $state(false);
  let shareFallback = $state<string | undefined>(undefined);
  let countdown = $state('');

  const makerHasClips = $derived(editor.composition.tracks.some((track) => track.clips.length > 0));
  const noticeActions = $derived(
    editor.notice === TAKE_SAVED
      ? [
          { label: 'Play it', onClick: () => void editor.playCapture() },
          { label: 'Share it', onClick: () => openShare() },
        ]
      : [],
  );

  const updateCountdown = () => {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    const remaining = Math.max(0, next.getTime() - Date.now());
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    countdown =
      hours === 0
        ? `${minutes}m until tomorrow’s kit`
        : `${hours}h ${minutes}m until tomorrow’s kit`;
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

  const leaveShared = () => {
    editor.stopPlayback();
    shared = undefined;
    sharedError = undefined;
    resetHash();
    view = 'maker';
    void editor.loadAudio();
  };
  const showMaker = (mode: 'play' | 'arrange') => {
    if (view === 'tutorial') return finishTutorial(false, mode);
    if (view !== 'maker') leaveShared();
    if (mode === 'arrange') {
      if (editor.captureStatus !== 'idle') editor.stopCapture();
      if (editor.playingPerformance) editor.stopCapturePlayback();
    }
    makerMode = mode;
  };

  const openShare = () => {
    shareFallback = undefined;
    shareOpen = true;
  };
  const closeShare = () => {
    shareOpen = false;
    shareFallback = undefined;
  };

  const openShared = (composition: CompositionV1) => {
    closeShare();
    editor.stopPlayback();
    shared = { composition };
    sharedError = undefined;
    sharedPicked = false;
    view = 'shared';
    void fingerprintForComposition(composition).then((fingerprint) => {
      sharedPicked = loadFavorite(composition.challenge.date) === fingerprint;
    });
  };

  /** Brings a shared loop into Arrange as the maker's own draft. */
  const remixShared = () => {
    if (!shared) return;
    const composition = shared.composition;
    leaveShared();
    makerMode = 'arrange';
    editor.importComposition(composition);
  };

  const readSharedFragment = () => {
    const fragment = location.hash;
    if (!fragment.startsWith('#audle=')) return;
    editor.stopPlayback();
    closeShare();
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
          closeShare();
          editor.notice = `Your Audle is on its way. ${countdown}.`;
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        closeShare();
        editor.notice = `Link copied. Send the beat. ${countdown}.`;
      } catch {
        shareFallback = url;
        shareOpen = true;
      }
    } catch (error) {
      editor.notice =
        error instanceof ShareCodecError && error.code === 'too-long'
          ? 'This loop is too dense for a share link. Delete a few hits and try again.'
          : 'This Audle link could not be created.';
    }
  };

  const startTutorial = () => {
    if (view === 'tutorial') return;
    if (view === 'shared') leaveShared();
    closeShare();
    editor.stopPlayback();
    tutorialCanKeep = !makerHasClips;
    tutorial = new EditorState(engine, challenge, starterForChallenge(challenge));
    view = 'tutorial';
    void tutorial.loadAudio();
  };

  const finishTutorial = (keep: boolean, mode: 'play' | 'arrange' = makerMode) => {
    const finished = tutorial;
    if (!finished) return;
    saveTutorialComplete();
    engine.stop();
    if (keep && tutorialCanKeep) editor.importComposition(finished.composition);
    finished.detach();
    tutorial = undefined;
    view = 'maker';
    makerMode = mode;
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
    <p class="daily-readout">
      <span
        >Kit for {kitLabel} · {challenge.bpm} BPM · {challenge.key.root} {challenge.key.mode}</span
      ><small>{countdown}</small>
    </p>
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
        aria-label="Help"
        aria-current={view === 'tutorial' ? 'page' : undefined}
        class:current={view === 'tutorial'}
        class="help"
        title="Play with a ready-made beat"
        type="button"
        onclick={startTutorial}><Icon name="help" size={18} /></button
      >
    </nav>
  </header>

  {#if view === 'maker'}
    <StatusNotice
      message={editor.notice}
      actions={noticeActions}
      onDismiss={() => (editor.notice = undefined)}
    />
    {#if makerMode === 'play'}
      <div class="view" in:rise>
        <PlayStage
          {editor}
          onArrange={() => showMaker('arrange')}
          onShare={openShare}
          onTakeSaved={() => (editor.notice = TAKE_SAVED)}
        />
      </div>
    {:else}
      <section class="maker-workspace" in:rise>
        <PadBank {challenge} {editor} />
        <div class="arrangement">
          {#if !makerHasClips && !editor.loading}
            <div class="empty-arrangement">
              <strong>Tap any sound.</strong><span
                >Tap a lane to place a sound, let Jev jam a loop, or start from something made.</span
              >
              <div class="empty-actions">
                <button
                  disabled={editor.jamming}
                  type="button"
                  use:press
                  onclick={() => void editor.jamWithJev('')}
                  ><Icon name="spark" /> Jam with Jev</button
                ><button
                  type="button"
                  use:press
                  onclick={() => editor.importComposition(starterForChallenge(challenge))}
                  >Remix today’s starter</button
                ><button type="button" class="quiet" use:press onclick={startTutorial}
                  >Try a ready-made beat</button
                >
              </div>
              <div class="examples" role="group" aria-label="Hear an example">
                <span>Hear an example</span>
                {#each examples as example, index (index)}
                  <button type="button" onclick={() => openShared(example)}
                    ><Icon name="play" size={12} />
                    {EXAMPLE_NAMES[index] ?? `Example ${index + 1}`}</button
                  >
                {/each}
              </div>
            </div>
          {/if}
          <JevJam {editor} />
          <TimelineEditor {editor} />
          <div class="dock">
            <SelectionActions {editor} />
            <TransportBar {editor} onShare={openShare} />
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
          onRemix={remixShared}
          onBack={leaveShared}
        />
      </div>
    {:else}
      <section class="shared-error" role="alert">
        <h1>That link did not open.</h1>
        <p>{sharedError ?? 'This Audle link is damaged or from a newer version'}</p>
        <button type="button" onclick={leaveShared}>Back to Play</button>
      </section>
    {/if}
  {/if}

  <ShareSheet
    {editor}
    open={shareOpen}
    history={sharedImported}
    fallbackLink={shareFallback}
    onClose={closeShare}
    onShareLoop={() => void shareComposition(editor.composition)}
    onShareTake={(take) => void shareComposition(take.composition, take)}
    onOpen={openShared}
  />
</main>

<style>
  .app-shell {
    min-block-size: 100dvh;
    background: var(--audle-page);
  }
  .deck-top {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 16px;
    min-block-size: 64px;
    padding: 8px clamp(14px, 3vw, 36px);
    background: var(--audle-deck);
    border-block-end: 1px solid var(--audle-outline);
    box-shadow: var(--audle-deck-edge);
  }
  .wordmark {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--audle-text);
    cursor: pointer;
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.05em;
  }
  .daily-readout {
    display: grid;
    gap: 1px;
    margin: 0;
    color: var(--audle-text-muted);
    font-size: 0.78rem;
    font-weight: 700;
  }
  .daily-readout small {
    color: var(--audle-text-dim);
    font-size: 0.72rem;
    font-weight: 400;
  }
  nav {
    display: flex;
    align-items: center;
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
    border-color: var(--audle-accent);
  }
  nav .help {
    display: grid;
    place-items: center;
    inline-size: 44px;
    padding: 0;
    margin-inline-start: 4px;
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
    border-block-start: 1px solid var(--audle-outline);
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
  .shared-error button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: 44px;
    padding-inline: 12px;
    border: 1px solid var(--audle-loop-light);
    background: var(--audle-loop-surface);
    color: var(--audle-text);
    cursor: pointer;
    font-weight: 700;
  }
  .empty-arrangement .quiet {
    border-color: var(--audle-outline);
    background: var(--audle-control);
  }
  .examples {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-block-start: 6px;
    padding-block-start: 10px;
    border-block-start: 1px solid var(--audle-outline-subtle);
    inline-size: 100%;
  }
  .examples > span {
    margin-inline-end: 4px;
  }
  .empty-arrangement .examples button {
    min-block-size: 36px;
    padding-inline: 10px;
    border-color: var(--audle-outline-subtle);
    background: transparent;
    color: var(--audle-text-muted);
    font-size: 0.8rem;
  }
  .empty-arrangement .examples button:hover {
    color: var(--audle-accent);
  }
  .shared-error {
    inline-size: min(100% - 32px, 640px);
    margin: 12vh auto;
    padding: 28px;
    background: var(--audle-deck-raised);
    border: 1px solid var(--audle-record-light);
    box-shadow: inset 0 0 0 1px var(--audle-record-light);
  }
  .shared-error h1 {
    margin-block-start: 0;
    font-size: 1.6rem;
  }
  .shared-error p {
    color: var(--audle-text-muted);
  }
  @media (max-width: 959px) {
    .maker-workspace {
      grid-template-columns: minmax(0, 1fr);
    }
    /* On a phone the timeline comes first, so a tap on a pad lands where the maker can see it. */
    .arrangement {
      order: 0;
    }
    /* The pad bank and tuning deck are other components' roots, so they need global selectors. */
    .maker-workspace > :global(:first-child) {
      order: 1;
    }
    .maker-workspace > :global(:last-child) {
      order: 2;
    }
    .tutorial-workspace {
      padding-block-start: 0;
    }
  }
  @media (max-width: 620px) {
    .deck-top {
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      min-block-size: 58px;
    }
    .wordmark {
      font-size: 1.3rem;
    }
    .daily-readout {
      font-size: 0.7rem;
    }
    .daily-readout small {
      display: none;
    }
    nav button {
      padding-inline: 8px;
      font-size: 0.85rem;
    }
  }
  @media (max-width: 400px) {
    .deck-top {
      padding-inline: 10px;
    }
    .daily-readout span {
      display: block;
      max-inline-size: 16ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .maker-workspace {
      padding: 6px;
      gap: 6px;
    }
  }
</style>
