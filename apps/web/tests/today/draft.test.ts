/**
 * The draft kept on the phone (U7 D6, D32). Every read and write is guarded:
 * a phone with storage blocked or full still captures, it just keeps nothing.
 */
import { clearDraft, draftKey, readDraft, writeDraft, type Draft } from '../../lib/today/draft.js';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (k) => items.get(k) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (k) => void items.delete(k),
    setItem: (k, v) => void items.set(k, v)
  };
}

const blocked: Storage = {
  length: 0,
  clear: () => {
    throw new Error('SecurityError');
  },
  getItem: () => {
    throw new Error('SecurityError');
  },
  key: () => null,
  removeItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  }
};

const DRAFT: Draft = {
  forRecordId: null,
  clientRequestId: '00000000-0000-4000-8000-00000000c001',
  dead: '14',
  culls: '3',
  cullsOpen: false,
  feedKg: '303.0',
  standardConfirmed: true,
  weighOpen: false,
  avgWeightG: '',
  weightSampleSize: '',
  notesOpen: false,
  notes: ''
};

describe('the draft on the phone', () => {
  it('is keyed by batch and date', () => {
    expect(draftKey('b1', '2026-10-17')).toBe('runproduce:draft:b1:2026-10-17');
  });

  it('round-trips', () => {
    const storage = memoryStorage();
    writeDraft(storage, 'b1', '2026-10-17', DRAFT);
    expect(readDraft(storage, 'b1', '2026-10-17')).toEqual(DRAFT);
    expect(readDraft(storage, 'b1', '2026-10-18')).toBeNull();
  });

  it('is gone once cleared', () => {
    const storage = memoryStorage();
    writeDraft(storage, 'b1', '2026-10-17', DRAFT);
    clearDraft(storage, 'b1', '2026-10-17');
    expect(readDraft(storage, 'b1', '2026-10-17')).toBeNull();
  });

  it.each([
    ['not JSON', '{oops'],
    ['the wrong shape', JSON.stringify({ dead: 14 })],
    ['a flag that is not a boolean', JSON.stringify({ ...DRAFT, standardConfirmed: 'yes' })]
  ])('reads %s as no draft', (_label, stored) => {
    const storage = memoryStorage();
    storage.setItem(draftKey('b1', '2026-10-17'), stored);
    expect(readDraft(storage, 'b1', '2026-10-17')).toBeNull();
  });

  it('never throws when storage is blocked, full or missing', () => {
    for (const storage of [blocked, null]) {
      expect(readDraft(storage, 'b1', '2026-10-17')).toBeNull();
      expect(() => writeDraft(storage, 'b1', '2026-10-17', DRAFT)).not.toThrow();
      expect(() => clearDraft(storage, 'b1', '2026-10-17')).not.toThrow();
    }
  });
});
