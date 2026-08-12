<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ToneAudioEngine } from './lib/audio/engine';
  import TutorialCoach from './lib/components/TutorialCoach.svelte';
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
  import { ShareCodecError, decodeShare, encodeShare, fingerprintForComposition } from './lib/domain/share-codec';
  import type { CompositionV1 } from './lib/domain/model';
  import { loadFavorite, loadImports, loadTutorialComplete, saveFavorite, saveImport, saveTutorialComplete } from './lib/state/persistence';
  import { EditorState } from './lib/state/editor.svelte';


  type View = 'maker' | 'listen' | 'shared' | 'tutorial';

  const today = new Date().toISOString().slice(0, 10);
  const challenge = challengeForDate(today);
  const engine = new ToneAudioEngine();
  const editor = new EditorState(engine, challenge);
  const examples = examplesForChallenge(challenge);

  let view = $state<View>('maker');
  let tutorial = $state<EditorState | undefined>(undefined);
  let tutorialCanKeep = $state(false);
  let tutorialOffered = $state(false);
  let shared = $state<CompositionV1 | undefined>(undefined);
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
      .map((payload) => decodeShare(payload))
      .flatMap((result) => result.ok ? [result.value] : []);
  };

  const resetHash = () => {
    if (location.hash.startsWith('#audle=')) history.replaceState(null, '', `${location.pathname}${location.search}`);
  };

  const leaveShared = (nextView: 'maker' | 'listen') => {
    engine.stop();
    shared = undefined;
    sharedError = undefined;
    resetHash();
    view = nextView;
    void editor.loadAudio();
  };

  const openShared = (composition: CompositionV1) => {
    engine.stop();
    shared = composition;
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
    const payload = fragment.slice('#audle='.length);
    const result = decodeShare(payload);
    view = 'shared';
    if (!result.ok) {
      shared = undefined;
      sharedError = 'This Audle link is damaged or from a newer version';
      return;
    }
    shared = result.value;
    sharedError = undefined;
    saveImport(result.value.challenge.date, payload);
    refreshImports();
    void fingerprintForComposition(result.value).then((fingerprint) => {
      sharedPicked = loadFavorite(result.value.challenge.date) === fingerprint;
    });
  };

  const openListen = () => {
    resetHash();
    view = 'listen';
    refreshImports();
  };

  const shareComposition = async (composition: CompositionV1) => {
    try {
      const payload = encodeShare(composition);
      const url = `${location.origin}${location.pathname}#audle=${payload}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Audle', text: 'Play this Audle.', url });
          editor.notice = 'Link copied. Send the beat.';
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
      editor.notice = error instanceof ShareCodecError && error.code === 'too-long'
        ? 'This loop is too dense for a share link. Delete a few hits and try again.'
        : 'This Audle link could not be created.';
    }
  };

  const startTutorial = () => {
    engine.stop();
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
    try {
      engine.stop();
      await engine.loadChallenge(shared.challenge);
      engine.setComposition(shared);
      await engine.unlock();
      engine.play();
    } catch {
      sharedError = 'A sound for this shared Audle could not load. Try again.';
    }
  };

  const chooseSharedFavorite = async () => {
    if (!shared) return;
    const fingerprint = await fingerprintForComposition(shared);
    if (!saveFavorite(shared.challenge.date, fingerprint)) {
      editor.notice = 'Draft saving is unavailable in this browser';
      return;
    }
    sharedPicked = true;
  };

  onMount(() => {
    updateCountdown();
    const clock = window.setInterval(updateCountdown, 30_000);
    tutorialOffered = !loadTutorialComplete();
    refreshImports();
    readSharedFragment();
    window.addEventListener('hashchange', readSharedFragment);
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      window.__audleDebug = {
        audioState: () => engine.debug().audioState,
        transportTick: () => engine.debug().transportTick,
        outputRms: () => engine.debug().outputRms,
        activeVoiceCount: () => engine.debug().activeVoiceCount,
      };
    }
    void editor.loadAudio();
    return () => {
      window.clearInterval(clock);
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
    <button class="wordmark" type="button" onclick={() => leaveShared('maker')}>Audle</button>
    <div class="daily-readout"><strong>{challenge.date}</strong><span>{challenge.bpm} BPM · {challenge.key.root} {challenge.key.mode}</span><small>{countdown}</small></div>
    <nav aria-label="Audle views">
      <button aria-current={view === 'maker' ? 'page' : undefined} class:current={view === 'maker'} type="button" onclick={() => leaveShared('maker')}>Make</button>
      <button aria-current={view === 'listen' ? 'page' : undefined} class:current={view === 'listen'} type="button" onclick={openListen}>Listen</button>
      <button aria-current={view === 'tutorial' ? 'page' : undefined} class:current={view === 'tutorial'} type="button" onclick={startTutorial}>Help</button>
    </nav>
  </header>

  {#if view === 'maker'}
    {#if tutorialOffered}
      <section class="tutorial-offer" aria-label="Tutorial offer"><span>New here?</span><strong>Play with a ready-made beat.</strong><button type="button" onclick={startTutorial}>Start tutorial</button><button class="quiet" type="button" onclick={() => { tutorialOffered = false; saveTutorialComplete(); }}>Not now</button></section>
    {/if}
    <StatusNotice message={editor.notice} onDismiss={() => editor.notice = undefined} />
    <section class="maker-workspace">
      <PadBank {challenge} {editor} />
      <div class="arrangement">
        {#if !makerHasClips && !editor.loading}
          <div class="empty-arrangement"><strong>Tap any sound.</strong><span>Build from nothing, or start with three open voices.</span><button type="button" onclick={() => editor.importComposition(starterForChallenge(challenge))}>Remix today’s starter</button></div>
        {/if}
        <TimelineEditor {editor} />
        <SelectionActions {editor} />
        <TransportBar {editor} onShare={() => void shareComposition(editor.composition)} />
      </div>
      <TuningDeck {editor} />
    </section>
  {:else if view === 'tutorial' && tutorial}
    <TutorialCoach editor={tutorial} onShare={() => void shareComposition(tutorial!.composition)} onFinish={finishTutorial} />
    <section class="maker-workspace tutorial-workspace">
      <PadBank {challenge} editor={tutorial} />
      <div class="arrangement"><TimelineEditor editor={tutorial} /><SelectionActions editor={tutorial} /><TransportBar editor={tutorial} onShare={() => void shareComposition(tutorial!.composition)} /></div>
      <TuningDeck editor={tutorial} />
    </section>
  {:else if view === 'listen'}
    <ListenGallery {examples} shared={sharedImported} onOpen={openShared} />
  {:else if view === 'shared'}
    {#if shared}
      <SharedAudlePlayer composition={shared} playing={editor.playing} picked={sharedPicked} onPlay={() => void playShared()} onPick={() => void chooseSharedFavorite()} onBack={() => leaveShared('maker')} />
    {:else}
      <section class="shared-error" role="alert"><h1>That link did not open.</h1><p>{sharedError ?? 'This Audle link is damaged or from a newer version'}</p><button type="button" onclick={() => leaveShared('maker')}>Back to Make</button></section>
    {/if}
  {/if}

  {#if shareFallback}
    <section class="share-fallback" aria-labelledby="share-fallback-title"><h2 id="share-fallback-title">Copy this link</h2><input bind:this={shareInput} readonly value={shareFallback} /><button type="button" onclick={() => shareInput?.select()}>Select link</button><button type="button" onclick={() => shareFallback = undefined}>Close</button></section>
  {/if}
</main>

<style>
  .app-shell { min-block-size: 100dvh; background: var(--audle-page); }
  .deck-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; min-block-size: 74px; padding: 10px clamp(14px, 3vw, 36px); background: var(--audle-deck); border-block-end: 1px solid var(--audle-outline); box-shadow: var(--audle-deck-edge); }
  .wordmark { justify-self: start; border: 0; background: transparent; color: var(--audle-text); cursor: pointer; font-size: 1.55rem; font-weight: 800; letter-spacing: -0.09em; }
  .daily-readout { display: grid; justify-items: center; font-family: ui-monospace, monospace; text-align: center; } .daily-readout strong { font-size: 0.8rem; } .daily-readout span, .daily-readout small { color: var(--audle-text-muted); font-size: 0.65rem; } .daily-readout small { color: var(--audle-playback-light); }
  nav { display: flex; justify-self: end; gap: 4px; } nav button { min-block-size: 44px; padding-inline: 12px; border: 0; border-block-end: 2px solid transparent; background: transparent; color: var(--audle-text-muted); cursor: pointer; font-weight: 700; } nav button.current { color: var(--audle-text); border-color: var(--audle-playback-light); }
  .maker-workspace { display: grid; grid-template-columns: 300px minmax(0, 1fr) 260px; gap: 10px; padding: 10px; } .arrangement { position: relative; display: grid; align-content: start; gap: 10px; min-inline-size: 0; }
  .empty-arrangement { position: absolute; z-index: 8; inset: 70px 24px auto; display: grid; justify-items: start; gap: 7px; max-inline-size: 380px; padding: 16px; background: var(--audle-deck); border: 1px solid var(--audle-outline); box-shadow: var(--audle-deck-edge); } .empty-arrangement span { color: var(--audle-text-muted); font-size: 0.82rem; } .empty-arrangement button, .tutorial-offer button, .shared-error button, .share-fallback button { min-block-size: 44px; padding-inline: 12px; border: 1px solid var(--audle-loop-light); background: var(--audle-loop-surface); color: var(--audle-text); cursor: pointer; font-weight: 700; }
  .tutorial-offer { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; margin: 10px; padding: 10px 14px; background: var(--audle-deck-raised); border: 1px solid var(--audle-outline); } .tutorial-offer span { color: var(--audle-playback-light); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; } .tutorial-offer .quiet { border-color: var(--audle-outline); background: var(--audle-control); }
  .shared-error, .share-fallback { inline-size: min(100% - 32px, 640px); margin: 12vh auto; padding: 28px; background: var(--audle-deck-raised); border: 1px solid var(--audle-record-light); box-shadow: inset 0 0 0 1px var(--audle-record-light); } .shared-error h1, .share-fallback h2 { margin-block-start: 0; } .shared-error p { color: var(--audle-text-muted); } .share-fallback { display: grid; gap: 10px; position: fixed; z-index: 20; inset: 0; margin: auto; block-size: max-content; } .share-fallback input { min-block-size: 44px; padding-inline: 8px; border: 1px solid var(--audle-outline); background: var(--audle-well); color: var(--audle-text); }
  @media (max-width: 959px) { .deck-top { grid-template-columns: 1fr auto; } .daily-readout { display: none; } .maker-workspace { grid-template-columns: minmax(0, 1fr); } .maker-workspace > :first-child { order: 0; } .arrangement { order: 1; } .maker-workspace > :last-child { order: 2; } .tutorial-workspace { padding-block-start: 0; } }
  @media (max-width: 540px) { .deck-top { min-block-size: 62px; } .wordmark { font-size: 1.35rem; } nav button { min-block-size: 44px; padding-inline: 8px; font-size: 0.8rem; } .maker-workspace { padding: 6px; gap: 6px; } }
</style>
