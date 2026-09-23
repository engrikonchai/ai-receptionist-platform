import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * The two Daylight button treatments (Handoff.dc.html "COMPONENT
 * RULES" — primary: indigo fill, weight 700, radius 14, 44px min
 * height; secondary: same box, 1.5px border, transparent fill). Not
 * the shared shadcn `<Button>` — that component's variants are hard-
 * wired to the dashboard's `--primary`/`--secondary` tokens
 * (src/components/ui/button.tsx), so reusing it here would either
 * fight its classes or require overriding the dashboard's own theme.
 * This is a dedicated marketing primitive built on the scoped
 * `daylight-*` utility classes instead — see src/styles/daylight.css.
 */
const marketingButtonVariants = cva(
  'inline-flex min-h-11 items-center justify-center rounded-daylight-button px-7 py-4 text-[15px] font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-daylight-focus',
  {
    variants: {
      variant: {
        primary:
          'bg-daylight-indigo text-white shadow-daylight-button hover:bg-daylight-indigo-hover',
        secondary: 'bg-daylight-surface text-daylight-ink hover:bg-daylight-indigo-tint',
        'secondary-on-navy':
          'border-daylight-on-navy-muted text-daylight-on-navy border-1.5 hover:bg-daylight-navy-panel',
        'primary-on-navy': 'bg-white text-daylight-on-indigo-emphasis hover:bg-daylight-indigo-tint'
      },
      fullWidthOnMobile: {
        true: 'w-full sm:w-auto'
      }
    },
    defaultVariants: {
      variant: 'primary',
      fullWidthOnMobile: false
    }
  }
);

type MarketingButtonProps = VariantProps<typeof marketingButtonVariants> & {
  href: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
};

export function MarketingButton({
  href,
  variant,
  fullWidthOnMobile,
  className,
  children,
  onClick
}: MarketingButtonProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(marketingButtonVariants({ variant, fullWidthOnMobile }), className)}
    >
      {children}
    </Link>
  );
}
