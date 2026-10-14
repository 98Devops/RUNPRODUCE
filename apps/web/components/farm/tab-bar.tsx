'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { showTabBar, type Tab } from '@/lib/nav/tabs';

/**
 * The bottom tab bar (AD-104, U7 D27). Text links only, each a 56px target.
 * Nothing renders for fewer than two tabs. The links keep `?batch=` and
 * nothing else, so a tab opens on the same batch at its own default date.
 *
 * `.tab-bar` hides while a field has focus (globals.css), so the phone's
 * keyboard never pushes the bar up over the form.
 */
export function TabBar({ tabs }: { readonly tabs: readonly Tab[] }) {
  const pathname = usePathname();
  const batch = useSearchParams().get('batch');
  if (!showTabBar(tabs)) return null;
  const query = batch ? `?batch=${encodeURIComponent(batch)}` : '';

  return (
    <nav aria-label="Farm" className="tab-bar fixed inset-x-0 bottom-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-[480px]">
        {tabs.map((tab) => {
          const current = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.id} className="flex-1">
              <Link
                href={`${tab.href}${query}`}
                aria-current={current ? 'page' : undefined}
                className={`flex h-14 items-center justify-center px-1 text-center text-sm leading-tight font-medium ${
                  current ? 'text-accent' : 'text-muted hover:text-ink'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
