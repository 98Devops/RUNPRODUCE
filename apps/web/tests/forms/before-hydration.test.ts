/**
 * T-F1 · A tap before the page's script has loaded must not lose the entry
 * (U8 chunk 5 finding, TD-18). A `<form>` with only an `onSubmit` handler has
 * no handler at all until React hydrates: the browser runs its own submit, a
 * GET to the page itself, and the reload wipes every field. React 19 queues a
 * pre-hydration submit of a form whose `action` is a function and replays it
 * once hydrated, so the server HTML must carry that action and every figure
 * must have a `name`, or the replayed FormData is empty.
 *
 * Rendered on the server exactly as Next renders it, with no browser.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { SEED_BREED_CURVE, type IsoDate } from '@runproduce/engine';
import { StartForm } from '../../components/start/start-form';
import { TodayForm } from '../../components/today/today-form';
import { buildTodayView } from '../../lib/today/view.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock('@/app/(farm)/start/actions', () => ({ submitPlacementAction: vi.fn() }));
vi.mock('@/app/(farm)/today/actions', () => ({ saveDayAction: vi.fn(), removeDayAction: vi.fn() }));

/** What React renders for a form it will replay: read from React, not written down. */
const replayed = (() => {
  const html = renderToString(h('form', { action: () => undefined }));
  const action = /<form action="([^"]+)"/.exec(html)?.[1];
  if (action === undefined) throw new Error('React rendered a function action without an action attribute');
  return action;
})();

/** The server HTML's form tag and the names it posts. */
function formOf(html: string) {
  const tag = /<form\b[^>]*>/.exec(html)?.[0] ?? '';
  const names = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1]);
  return { tag, names, replayRuntime: html.includes('$$reactFormReplay') };
}

const TODAY = '2026-10-14' as IsoDate;

describe('T-F1 · Start batch, submitted before hydration', () => {
  it('hands the submit to React to replay, with every figure named', () => {
    const html = renderToString(h(StartForm, { kind: 'start', today: TODAY, curves: [{ id: 'c1', name: 'Seed curve' }] }));
    const form = formOf(html);
    expect(form.tag).toContain(`action="${replayed}"`);
    expect(form.replayRuntime).toBe(true);
    expect(form.names).toEqual(['name', 'placementDate', 'chickCount', 'extraChickCount', 'chickPrice']);
  });

  it('names the growth curve too when there is a choice', () => {
    const html = renderToString(
      h(StartForm, {
        kind: 'start',
        today: TODAY,
        curves: [
          { id: 'c1', name: 'Seed curve' },
          { id: 'c2', name: 'Other' }
        ]
      })
    );
    expect(formOf(html).names).toContain('curveId');
  });

  it('does the same for a correction', () => {
    const html = renderToString(
      h(StartForm, {
        kind: 'correct',
        today: TODAY,
        batch: { batchId: '00000000-0000-4000-8000-0000000000b1', code: 'B1', placementVersionId: '00000000-0000-4000-8000-0000000000e1' },
        initial: { placementDate: '2026-10-12', chickCount: '6000', extraChickCount: '60', chickPrice: '1.00' }
      })
    );
    const form = formOf(html);
    expect(form.tag).toContain(`action="${replayed}"`);
    expect(form.names).toEqual(['placementDate', 'chickCount', 'extraChickCount', 'chickPrice']);
  });
});

describe('T-F1 · Today, submitted before hydration', () => {
  const view = buildTodayView({
    batch: {
      batchId: '00000000-0000-4000-8000-0000000000b1',
      code: 'B1',
      placementDate: '2026-10-12' as IsoDate,
      chickCount: 6000,
      extraChickCount: 60,
      breedCurveId: '00000000-0000-4000-8000-0000000000c1'
    },
    points: SEED_BREED_CURVE.points,
    records: [],
    date: TODAY,
    today: TODAY,
    role: 'WORKER',
    userId: 'user-me'
  });

  it('hands the submit to React to replay, with the day’s figures named', () => {
    const html = renderToString(h(TodayForm, { batchId: '00000000-0000-4000-8000-0000000000b1', batchQuery: 'batch=B1&', date: TODAY, view }));
    const form = formOf(html);
    expect(form.tag).toContain(`action="${replayed}"`);
    expect(form.replayRuntime).toBe(true);
    // Day 1 of a batch: culls has no previous day to carry, so it is an input.
    expect(form.names).toEqual(['dead', 'culls', 'feedKg']);
  });
});
