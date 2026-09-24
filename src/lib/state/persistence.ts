import { z } from 'zod';
import { decodeShare } from '../domain/share-codec';
import type { CompositionV1 } from '../domain/model';
import { validateComposition } from '../domain/schema';
import { validatePerformance, type PerformanceV1 } from '../domain/performance';

const importsSchema = z.array(z.string()).max(12);
const tutorialSchema = z.boolean();
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const storageKey = {
  draft: (date: string) => `audle:draft:v1:${date}`,
  performance: (date: string) => `audle:performance:v1:${date}`,
  imports: (date: string) => `audle:imports:v1:${date}`,
  favorite: (date: string) => `audle:favorite:v1:${date}`,
  tutorial: 'audle:tutorial:v1',
};

const getStorage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const readJson = (key: string): unknown => {
  const storage = getStorage();
  if (!storage) return undefined;
  try {
    const value = storage.getItem(key);
    return value === null ? undefined : JSON.parse(value);
  } catch {
    return undefined;
  }
};

const writeJson = (key: string, value: unknown): boolean => {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const loadDraft = (date: string): CompositionV1 | undefined => {
  const composition = validateComposition(readJson(storageKey.draft(date)));
  return composition?.challenge.date === date ? composition : undefined;
};

export const saveDraft = (composition: CompositionV1): boolean =>
  validateComposition(composition) !== undefined &&
  writeJson(storageKey.draft(composition.challenge.date), composition);
export const loadPerformance = (date: string): PerformanceV1 | undefined => {
  const performance = validatePerformance(readJson(storageKey.performance(date)));
  return performance?.composition.challenge.date === date ? performance : undefined;
};

export const savePerformance = (performance: PerformanceV1): boolean =>
  validatePerformance(performance) !== undefined &&
  writeJson(storageKey.performance(performance.composition.challenge.date), performance);

export const clearPerformance = (date: string): void => {
  try {
    getStorage()?.removeItem(storageKey.performance(date));
  } catch {
    // Private browsing can deny storage writes.
  }
};

export const loadImports = (date: string): string[] => {
  const parsed = importsSchema.safeParse(readJson(storageKey.imports(date)));
  if (!parsed.success) return [];
  return parsed.data.filter((payload) => {
    const decoded = decodeShare(payload);
    return decoded.ok && decoded.value.challenge.date === date;
  });
};

export const saveImport = (date: string, payload: string): boolean => {
  const decoded = decodeShare(payload);
  if (!decoded.ok || decoded.value.challenge.date !== date) return false;
  const imports = loadImports(date).filter((saved) => saved !== payload);
  imports.unshift(payload);
  return writeJson(storageKey.imports(date), imports.slice(0, 12));
};

export const loadTutorialComplete = (): boolean => {
  const parsed = tutorialSchema.safeParse(readJson(storageKey.tutorial));
  return parsed.success && parsed.data;
};

export const saveTutorialComplete = (): boolean => writeJson(storageKey.tutorial, true);

export const loadFavorite = (date: string): string | undefined => {
  const parsed = fingerprintSchema.safeParse(readJson(storageKey.favorite(date)));
  return parsed.success ? parsed.data : undefined;
};

export const saveFavorite = (date: string, fingerprint: string): boolean => {
  if (!fingerprintSchema.safeParse(fingerprint).success) return false;
  return writeJson(storageKey.favorite(date), fingerprint);
};
