'use client';

import type { Explained } from '@runproduce/engine';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatInput } from '@/lib/format';
import { ConfidenceBadge } from './primitives';

/**
 * The explainability pattern (ui-context.md): the figure with a dotted
 * underline; a click shows the formula in words, each input with its source,
 * and the confidence. It is what turns a number the owner distrusts into one he
 * acts on.
 */
export function Explain({
  explained,
  label,
  children
}: {
  readonly explained: Explained<unknown>;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded-sm underline decoration-line-strong decoration-dotted decoration-1 underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {children}
          <span className="sr-only">, how this is worked out</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-lg border-line bg-surface p-0 text-ink shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-sm font-medium">{label}</p>
          <ConfidenceBadge confidence={explained.confidence} />
        </div>
        <p className="px-4 py-3 text-sm leading-relaxed">{explained.formula}</p>
        <dl className="divide-y divide-line border-t border-line">
          {Object.entries(explained.inputs).map(([name, { value, source }]) => (
            <div key={name} className="px-4 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-xs">{name}</dt>
                <dd className="figures text-right text-sm">{formatInput(value)}</dd>
              </div>
              <p className="text-xs text-muted">{source}</p>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
