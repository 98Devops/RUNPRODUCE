/**
 * T-T2 · Which tabs a member sees (AD-104, U7 D27). A WORKER sees Today only;
 * an OWNER or MANAGER sees every tab built so far, in the sheets' order. The
 * bar renders only when there are two or more.
 */
import { BUILT_TABS, canStartBatch, showTabBar, TABS, visibleTabs } from '../../lib/nav/tabs.js';

const ALL = TABS.map((t) => t.id);

describe('T-T2 · visibleTabs', () => {
  it('lists the five tabs in the order of the sheets', () => {
    expect(TABS.map((t) => [t.id, t.label, t.href])).toEqual([
      ['start', 'Start batch', '/start'],
      ['today', 'Today', '/today'],
      ['feed', 'Feed & bills', '/feed'],
      ['results', 'Results', '/results'],
      ['next', 'Next batch', '/next']
    ]);
  });

  it('gives a WORKER Today only, even with every tab built', () => {
    expect(visibleTabs('WORKER', ALL).map((t) => t.id)).toEqual(['today']);
  });

  it.each(['OWNER', 'MANAGER'] as const)('gives an %s every built tab, in order', (role) => {
    expect(visibleTabs(role, ALL).map((t) => t.id)).toEqual(ALL);
    expect(visibleTabs(role, ['results', 'today']).map((t) => t.id)).toEqual(['today', 'results']);
  });

  it('never shows a tab that is not built, for anyone', () => {
    expect(visibleTabs('OWNER', ['today']).map((t) => t.id)).toEqual(['today']);
    expect(visibleTabs('WORKER', ['start']).map((t) => t.id)).toEqual([]);
  });

  it('has Start batch and Today built after U8 step 2', () => {
    expect(BUILT_TABS).toEqual(['start', 'today']);
  });
});

describe('T-T2 · showTabBar', () => {
  it('renders no bar for zero or one tab', () => {
    expect(showTabBar([])).toBe(false);
    expect(showTabBar(visibleTabs('OWNER', ['today']))).toBe(false);
  });

  it('renders the bar for two or more', () => {
    expect(showTabBar(visibleTabs('OWNER', ['start', 'today']))).toBe(true);
  });

  it.each(['OWNER', 'MANAGER'] as const)('shows an %s the bar now that Start batch is built', (role) => {
    expect(visibleTabs(role, BUILT_TABS).map((t) => t.id)).toEqual(['start', 'today']);
    expect(showTabBar(visibleTabs(role, BUILT_TABS))).toBe(true);
  });

  it('still shows a WORKER no bar: Today is their only tab', () => {
    expect(showTabBar(visibleTabs('WORKER', BUILT_TABS))).toBe(false);
  });
});

describe('T-SB8 · canStartBatch (u8-start-batch.md D1)', () => {
  it.each([
    ['OWNER', true],
    ['MANAGER', true],
    ['WORKER', false]
  ] as const)('gives %s %s', (role, allowed) => {
    expect(canStartBatch(role)).toBe(allowed);
  });

  it('agrees with the tabs: whoever may start a batch sees the Start batch tab', () => {
    for (const role of ['OWNER', 'MANAGER', 'WORKER'] as const) {
      const seesStart = visibleTabs(role, ['start', 'today']).some((t) => t.id === 'start');
      expect(seesStart).toBe(canStartBatch(role));
    }
  });
});
