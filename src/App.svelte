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
  import FocusedTimeline from './lib/components/FocusedTimeline.svelte';
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
    const changingView = view !== 'maker' || makerMode !== mode;
    if (mode === 'play') editor.disarmRecording();
    if (view !== 'maker') leaveShared();
    if (mode === 'arrange') {
      if (editor.captureStatus !== 'idle') editor.stopCapture();
      if (editor.playingPerformance) editor.stopCapturePlayback();
    }
    makerMode = mode;
    if (changingView) window.scrollTo(0, 0);
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
    editor.disarmRecording();
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
    window.scrollTo(0, 0);
    editor.importComposition(composition);
  };

  const readSharedFragment = () => {
    const fragment = location.hash;
    if (!fragment.startsWith('#audle=')) return;
    editor.disarmRecording();
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
    editor.disarmRecording();
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
    finished.disarmRecording();
    engine.stop();
    if (keep && tutorialCanKeep) editor.importComposition(finished.composition);
    finished.detach();
    tutorial = undefined;
    view = 'maker';
    makerMode = mode;
    window.scrollTo(0, 0);
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

<main class="app-shell min-h-dvh bg-audle-page">
  <header
    class="deck-top grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-audle-outline bg-audle-deck px-[clamp(14px,3vw,36px)] py-2 shadow-[var(--audle-deck-edge)] max-[621px]:min-h-[58px] max-[621px]:gap-2.5 max-[401px]:px-2.5"
  >
    <button
      class="wordmark cursor-pointer border-0 bg-transparent p-0 text-2xl font-extrabold tracking-[-0.05em] text-audle-text max-[621px]:text-[1.3rem]"
      type="button"
      onclick={() => showMaker('play')}>Audle</button
    >
    <p
      class="daily-readout m-0 grid min-w-0 gap-px text-[0.78rem] font-bold text-audle-text-muted max-[621px]:text-[0.7rem]"
    >
      <span
        class="max-[401px]:block max-[401px]:max-w-[16ch] max-[401px]:overflow-hidden max-[401px]:text-ellipsis max-[401px]:whitespace-nowrap"
        >Kit for {kitLabel} · {challenge.bpm} BPM · {challenge.key.root} {challenge.key.mode}</span
      ><small class="text-[0.72rem] font-normal text-audle-text-dim max-[621px]:hidden"
        >{countdown}</small
      >
    </p>
    <nav class="flex shrink-0 items-center gap-1" aria-label="Audle views">
      <button
        aria-current={view === 'maker' && makerMode === 'play' ? 'page' : undefined}
        class:current={view === 'maker' && makerMode === 'play'}
        class="min-h-11 cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-3 font-bold text-audle-text-muted aria-[current=page]:border-audle-text aria-[current=page]:text-audle-text max-[621px]:px-2 max-[621px]:text-[0.85rem]"
        type="button"
        onclick={() => showMaker('play')}>Play</button
      >
      <button
        aria-current={view === 'maker' && makerMode === 'arrange' ? 'page' : undefined}
        class:current={view === 'maker' && makerMode === 'arrange'}
        class="min-h-11 cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-3 font-bold text-audle-text-muted aria-[current=page]:border-audle-text aria-[current=page]:text-audle-text max-[621px]:px-2 max-[621px]:text-[0.85rem]"
        type="button"
        onclick={() => showMaker('arrange')}>Arrange</button
      >
      <button
        aria-label="Help"
        aria-current={view === 'tutorial' ? 'page' : undefined}
        class:current={view === 'tutorial'}
        class="help grid size-11 cursor-pointer place-items-center border-0 border-b-2 border-transparent bg-transparent p-0 font-bold text-audle-text-muted aria-[current=page]:border-audle-text aria-[current=page]:text-audle-text ms-1"
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
      <section
        class="maker-workspace grid grid-cols-[300px_minmax(0,1fr)_260px] gap-2.5 p-2.5 max-[960px]:grid-cols-[minmax(0,1fr)] max-[960px]:[&>:first-child]:order-1 max-[960px]:[&>:last-child]:order-2 max-[401px]:gap-1.5 max-[401px]:p-1.5"
        in:rise
      >
        <PadBank {challenge} {editor} />
        <div
          class="arrangement relative grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2.5 max-[960px]:order-0"
        >
          <FocusedTimeline {editor} />
          {#if !makerHasClips && !editor.loading}
            <div
              class="empty-arrangement grid justify-items-start gap-[7px] border border-audle-outline bg-audle-deck p-4 shadow-[var(--audle-deck-edge)]"
            >
              <strong>Want a starting point?</strong><span
                class="text-[0.82rem] text-audle-text-muted"
                >Start from a beat, or hear what others made with today’s sounds.</span
              >
              <div class="empty-actions flex flex-wrap gap-2">
                <button
                  class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-audle-loop-light bg-audle-loop-surface px-3 font-bold text-audle-text"
                  type="button"
                  use:press
                  onclick={() => editor.importComposition(starterForChallenge(challenge))}
                  >Remix today’s starter</button
                ><button
                  class="quiet inline-flex min-h-11 cursor-pointer items-center gap-2 border border-audle-outline bg-audle-control px-3 font-bold text-audle-text"
                  type="button"
                  use:press
                  onclick={startTutorial}>Try a ready-made beat</button
                >
              </div>
              <details class="examples mt-1.5 w-full border-t border-audle-outline-subtle pt-2.5">
                <summary class="min-h-11 cursor-pointer text-audle-text-muted"
                  >Hear an example</summary
                >
                <div class="flex flex-wrap items-center gap-1.5">
                  {#each examples as example, index (index)}
                    <button
                      class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-audle-outline-subtle bg-transparent px-2.5 text-[0.8rem] font-bold text-audle-text-muted hover:text-audle-accent"
                      type="button"
                      onclick={() => openShared(example)}
                      ><Icon name="play" size={12} />
                      {EXAMPLE_NAMES[index] ?? `Example ${index + 1}`}</button
                    >
                  {/each}
                </div>
              </details>
            </div>
          {/if}
          <JevJam {editor} />
          <div
            class="dock sticky z-10 grid border-t border-audle-outline bg-audle-deck [inset-block-end:env(safe-area-inset-bottom,0px)]"
            class:empty={!makerHasClips}
          >
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
    <section
      class="maker-workspace tutorial-workspace grid grid-cols-[300px_minmax(0,1fr)_260px] gap-2.5 p-2.5 max-[960px]:grid-cols-[minmax(0,1fr)] max-[960px]:[&>:first-child]:order-1 max-[960px]:[&>:last-child]:order-2 max-[960px]:pt-0 max-[401px]:gap-1.5 max-[401px]:p-1.5"
      in:rise
    >
      <PadBank {challenge} editor={tutorial} />
      <div
        class="arrangement relative grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2.5 max-[960px]:order-0"
      >
        <FocusedTimeline editor={tutorial} /><JevJam editor={tutorial} />
        <div
          class="dock sticky z-10 grid border-t border-audle-outline bg-audle-deck [inset-block-end:env(safe-area-inset-bottom,0px)]"
        >
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
      <section
        class="shared-error mx-auto my-[12vh] w-[min(100%_-_32px,640px)] border border-audle-record-light bg-audle-deck-raised p-7 shadow-[inset_0_0_0_1px_var(--audle-record-light)]"
        role="alert"
      >
        <h1 class="mt-0 text-[1.6rem]">That link did not open.</h1>
        <p class="text-audle-text-muted">
          {sharedError ?? 'This Audle link is damaged or from a newer version'}
        </p>
        <button
          class="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-audle-loop-light bg-audle-loop-surface px-3 font-bold text-audle-text"
          type="button"
          onclick={leaveShared}>Back to Play</button
        >
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
  @media (max-width: 620px) {
    .dock.empty {
      position: static;
    }
  }
</style>
