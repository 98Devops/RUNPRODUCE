/**
 * T-T1 · Which batch a farm tab shows (AD-104, U7 D27). `?batch=<code>` picks
 * one; with none, the most recently placed open batch. An unknown code is said
 * plainly and never swapped for another batch.
 */
import { resolveBatch } from '../../lib/nav/resolve-batch.js';

const batch = (code: string, placementDate: string) => ({ code, placementDate });

describe('T-T1 · resolveBatch', () => {
  it('says none when there are no batches', () => {
    expect(resolveBatch([], null)).toEqual({ kind: 'none' });
  });

  it('says none, not unknown, when a code is asked for and there are no batches', () => {
    expect(resolveBatch([], 'B1')).toEqual({ kind: 'none' });
  });

  it('picks the only batch', () => {
    const only = batch('B1', '2026-10-06');
    expect(resolveBatch([only], null)).toEqual({ kind: 'batch', batch: only });
  });

  it('defaults to the most recently placed, whatever the order given', () => {
    const older = batch('B9', '2026-09-01');
    const latest = batch('B2', '2026-10-06');
    const middle = batch('B5', '2026-09-20');
    expect(resolveBatch([older, latest, middle], null)).toEqual({ kind: 'batch', batch: latest });
    expect(resolveBatch([latest, middle, older], undefined)).toEqual({ kind: 'batch', batch: latest });
  });

  it('breaks a tie on placement date by the later code, so the default is stable', () => {
    const a = batch('A', '2026-10-06');
    const b = batch('B', '2026-10-06');
    expect(resolveBatch([a, b], null)).toEqual({ kind: 'batch', batch: b });
    expect(resolveBatch([b, a], null)).toEqual({ kind: 'batch', batch: b });
  });

  it('treats an empty ?batch= as no choice', () => {
    const only = batch('B1', '2026-10-06');
    expect(resolveBatch([only], '')).toEqual({ kind: 'batch', batch: only });
  });

  it('picks a known code even when it is not the latest', () => {
    const older = batch('B1', '2026-09-01');
    const latest = batch('B2', '2026-10-06');
    expect(resolveBatch([older, latest], 'B1')).toEqual({ kind: 'batch', batch: older });
  });

  it('says unknown for a code it cannot see, and never swaps in another batch', () => {
    const only = batch('B1', '2026-10-06');
    expect(resolveBatch([only], 'B7')).toEqual({ kind: 'unknown', code: 'B7' });
  });

  it('matches codes exactly: codes that differ only in case are different batches', () => {
    const upper = batch('B1', '2026-09-01');
    const lower = batch('b1', '2026-10-06');
    expect(resolveBatch([upper, lower], 'B1')).toEqual({ kind: 'batch', batch: upper });
    expect(resolveBatch([upper, lower], 'b1')).toEqual({ kind: 'batch', batch: lower });
    expect(resolveBatch([upper], 'b1')).toEqual({ kind: 'unknown', code: 'b1' });
  });
});
