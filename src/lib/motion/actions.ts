import { animate, utils } from 'animejs';
import type { Action } from 'svelte/action';
import { DURATION, EASE, enterDelay, motionParams } from './config';
import { isMotionAllowed, motion } from './preference.svelte';

const activationKey = (event: KeyboardEvent) =>
  !event.repeat && (event.key === ' ' || event.key === 'Enter');

/** Compresses the element while a pointer or key holds it and springs it back on release. The
 * `data-pressed` attribute is set regardless of motion so CSS can show a static contact cue. */
export const press: Action<HTMLElement, { disabled?: boolean } | undefined> = (
  element,
  parameter,
) => {
  let disabled = parameter?.disabled ?? false;
  let held = false;

  const down = () => {
    if (disabled || held) return;
    held = true;
    element.setAttribute('data-pressed', 'true');
    if (!isMotionAllowed()) return;
    animate(element, {
      scale: 0.96,
      translateY: 2,
      duration: DURATION.press,
      ease: EASE.press,
      composition: 'replace',
    });
  };
  const up = () => {
    if (!held) return;
    held = false;
    element.removeAttribute('data-pressed');
    if (!isMotionAllowed()) {
      element.style.transform = '';
      return;
    }
    animate(element, {
      scale: 1,
      translateY: 0,
      ...motionParams(motion.mode, 'settle'),
      composition: 'replace',
      // Clearing the inline transform hands hover and focus styles back to the stylesheet.
      onComplete: () => (element.style.transform = ''),
    });
  };
  const keydown = (event: KeyboardEvent) => {
    if (activationKey(event)) down();
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.key === ' ' || event.key === 'Enter') up();
  };

  element.addEventListener('pointerdown', down);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', up);
  element.addEventListener('pointerleave', up);
  element.addEventListener('keydown', keydown);
  element.addEventListener('keyup', keyup);
  element.addEventListener('blur', up);

  return {
    update(next) {
      disabled = next?.disabled ?? false;
      if (disabled) up();
    },
    destroy() {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('pointerleave', up);
      element.removeEventListener('keydown', keydown);
      element.removeEventListener('keyup', keyup);
      element.removeEventListener('blur', up);
      utils.remove(element);
    },
  };
};

/** Pops the element once each time its parameter turns true, for chosen and selected states. An
 * action's `update` runs once per change, unlike an effect that would re-run on every dependency. */
export const popOn: Action<HTMLElement, boolean> = (element, active) => {
  let previous = active;
  const pop = () => {
    if (!isMotionAllowed() || !element.isConnected) return;
    animate(element, {
      scale: [1, 1.06, 1],
      ...motionParams(motion.mode, 'pop'),
      composition: 'replace',
    });
  };
  return {
    update(next) {
      if (next && !previous) pop();
      previous = next;
    },
    destroy() {
      utils.remove(element);
    },
  };
};

const entered = new Set<string>();

/** Fades and lifts the element in with a diagonal grid stagger. With `once`, the entrance plays a
 * single time per page load so revisiting a view does not replay it. Under reduced motion the
 * element is never hidden. */
export const enter: Action<HTMLElement, { index: number; columns: number; once?: string }> = (
  element,
  parameter,
) => {
  const key = parameter.once;
  // A hidden document pauses the animation engine, which would leave the element invisible.
  if (!isMotionAllowed() || document.hidden || (key && entered.has(key))) return {};
  utils.set(element, { opacity: 0, translateY: 8, scale: 0.98 });
  animate(element, {
    opacity: 1,
    translateY: 0,
    scale: 1,
    delay: enterDelay(parameter.index, parameter.columns),
    duration: DURATION.enter,
    ease: EASE.release,
    composition: 'replace',
    onComplete: () => {
      element.style.transform = '';
      element.style.opacity = '';
    },
  });
  return {
    update(next) {
      if (next.once) entered.add(next.once);
    },
    destroy() {
      if (key) entered.add(key);
      utils.remove(element);
    },
  };
};
