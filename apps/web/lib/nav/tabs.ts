/**
 * The farm tabs (AD-104, U7 D27), one per sheet of Daniel's workbook, in the
 * workbook's order. Pure, so who sees what is tested without a browser.
 *
 * A tab shows only once it is built, and the bar renders only when a member
 * has two or more. A WORKER has Today alone: the other four carry money, and
 * every page checks the role again on the server.
 */
// Relative: the Start batch save core imports this, and packages/db-tests runs that core.
import type { Role } from '../repositories/index.js';

export type TabId = 'start' | 'today' | 'feed' | 'results' | 'next';

export interface Tab {
  readonly id: TabId;
  readonly label: string;
  readonly href: string;
}

export const TABS: readonly Tab[] = [
  { id: 'start', label: 'Start batch', href: '/start' },
  { id: 'today', label: 'Today', href: '/today' },
  { id: 'feed', label: 'Feed & bills', href: '/feed' },
  { id: 'results', label: 'Results', href: '/results' },
  { id: 'next', label: 'Next batch', href: '/next' }
];

/** The tabs that exist so far. Each step of the plan adds its own. */
export const BUILT_TABS: readonly TabId[] = ['start', 'today'];

export function visibleTabs(role: Role, built: readonly TabId[]): Tab[] {
  return TABS.filter((tab) => built.includes(tab.id) && (role !== 'WORKER' || tab.id === 'today'));
}

/**
 * Who may start or correct a batch (U8 D1). The same rule the tab follows, so
 * the tab and the server's guard cannot disagree; `record_batch` checks it a
 * third time in the database.
 */
export function canStartBatch(role: Role): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

export function showTabBar(tabs: readonly Tab[]): boolean {
  return tabs.length >= 2;
}
