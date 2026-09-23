import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Icons } from '@/components/icons';

/**
 * Shell anatomy metric tile: white/`--card` surface, 34px/800 numeral,
 * 13px/700 muted label (Dashboard.dc.html's Overview metric-card
 * treatment). The whole tile is a single link — no nested interactive
 * elements inside it — so it stays unambiguous for keyboard/screen-
 * reader use while still reading as a clickable card.
 */
export function MetricTile({
  icon: Icon,
  label,
  value,
  href,
  hrefLabel,
  hint,
  attention = false
}: {
  icon: (typeof Icons)[keyof typeof Icons];
  label: string;
  value: number;
  href: string;
  hrefLabel: string;
  hint?: string;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={hrefLabel}
      className='focus-visible:outline-ring block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2'
    >
      <Card className='shadow-sm transition-colors hover:bg-muted/40'>
        <CardContent className='flex flex-col gap-3'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-muted-foreground text-[13px] font-bold'>{label}</span>
            <Icon
              className={cn('size-4', attention ? 'text-destructive' : 'text-muted-foreground')}
              aria-hidden='true'
            />
          </div>
          <span className='text-foreground text-[34px] leading-none font-extrabold tracking-[-0.025em]'>
            {value}
          </span>
          {hint && <span className='text-muted-foreground text-xs'>{hint}</span>}
        </CardContent>
      </Card>
    </Link>
  );
}
