import type { Confidence } from '@runproduce/engine';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

/**
 * shadcn's Card, customised to our tokens (code-standards.md: never shipped
 * default). White surface, default border, `rounded-lg`, no shadow: elevation
 * here carries no meaning.
 */
export function Panel({
  title,
  aside,
  children,
  className,
  labelledBy,
  tone = 'default'
}: {
  readonly title: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly labelledBy: string;
  /** `hero` is the recommendation card only: a faint accent tint (AD-100). */
  readonly tone?: 'default' | 'hero';
}) {
  const hero = tone === 'hero';
  return (
    <Card
      aria-labelledby={labelledBy}
      className={cn(
        'gap-0 rounded-lg py-0 shadow-none',
        hero ? 'border-accent-soft-border bg-accent-soft' : 'border-line',
        className
      )}
      role="region"
    >
      <header
        className={cn(
          'flex items-start justify-between gap-4 border-b px-5 py-4',
          hero ? 'border-accent-soft-border' : 'border-line'
        )}
      >
        <h2 id={labelledBy} className="text-lg font-medium leading-tight text-balance">
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </Card>
  );
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  measured: 'border-flow-in/40 text-flow-in',
  calibrated: 'border-flow-pending/40 text-flow-pending',
  assumed: 'border-dashed border-line-strong text-muted'
};

/** ui-context.md: measured green, calibrated amber, assumed grey with a dashed border. */
export function ConfidenceBadge({ confidence, label }: { readonly confidence: Confidence; readonly label?: string }) {
  return (
    <Badge variant="outline" className={cn('rounded-md bg-surface font-normal', CONFIDENCE_STYLE[confidence])}>
      {label === undefined ? confidence : `${label} · ${confidence}`}
    </Badge>
  );
}

/** One inset sub-row: a label, and a figure in tabular sans. */
export function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="figures text-right text-sm">{children}</dd>
    </div>
  );
}
