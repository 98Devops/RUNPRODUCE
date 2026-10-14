/**
 * The draft kept on the phone (U7 D6, D32): the form's fields as typed, the
 * "Use" flag and the client request id, under one key per batch and date.
 *
 * Every storage call is guarded. A phone with storage blocked, full or absent
 * still captures; it only keeps nothing between visits.
 */
import { z } from 'zod';

const draftShape = z.object({
  /** The record the form opened with; a draft for a record that has since changed is not restored. */
  forRecordId: z.string().nullable(),
  /** One per distinct entry: a retry of the same entry sends the same id (AD-75). */
  clientRequestId: z.string(),
  dead: z.string(),
  culls: z.string(),
  cullsOpen: z.boolean(),
  feedKg: z.string(),
  standardConfirmed: z.boolean(),
  weighOpen: z.boolean(),
  avgWeightG: z.string(),
  weightSampleSize: z.string(),
  notesOpen: z.boolean(),
  notes: z.string()
});

export type Draft = z.infer<typeof draftShape>;

export function draftKey(batchId: string, date: string): string {
  return `runproduce:draft:${batchId}:${date}`;
}

export function readDraft(storage: Storage | null, batchId: string, date: string): Draft | null {
  try {
    const stored = storage?.getItem(draftKey(batchId, date));
    if (!stored) return null;
    const parsed = draftShape.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeDraft(storage: Storage | null, batchId: string, date: string, draft: Draft): void {
  try {
    storage?.setItem(draftKey(batchId, date), JSON.stringify(draft));
  } catch {
    // Blocked or full: the form still saves, it just keeps nothing on the phone.
  }
}

export function clearDraft(storage: Storage | null, batchId: string, date: string): void {
  try {
    storage?.removeItem(draftKey(batchId, date));
  } catch {
    // As above.
  }
}

/** `localStorage`, or null where reading it throws (some privacy modes) or there is none. */
export function phoneStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
