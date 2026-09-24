import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/icons';

/**
 * Landing-page buttons. Kept separate from `MarketingButton`, which
 * /demo and the auth flow still use with the Daylight indigo look.
 * `primary` is the one prominent action (ink pill + arrow); `secondary`
 * is an outlined pill for the supporting action; `yellow` is the primary
 * action on the closing panel's yellow background.
 */
const landingButtonVariants = cva(
  'group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-bold whitespace-nowrap transition-[background-color,transform] duration-200 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-lp-blue text-white shadow-lp-soft hover:bg-lp-blue-deep pr-3',
        secondary: 'border-lp-ink/25 text-lp-ink hover:bg-lp-ink/5 border-2',
        onBlue: 'text-lp-blue-deep hover:bg-lp-blue-soft bg-white pr-3',
        onBlueOutline: 'border-2 border-white/60 text-white hover:bg-white/10'
      },
      fullWidthOnMobile: { true: 'w-full sm:w-auto' },
      size: { md: '', sm: 'min-h-10 pr-2 pl-5 text-sm' }
    },
    defaultVariants: { variant: 'primary', fullWidthOnMobile: false, size: 'md' }
  }
);

type LandingButtonProps = VariantProps<typeof landingButtonVariants> & {
  href: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
};

export function LandingButton({
  href,
  variant,
  fullWidthOnMobile,
  size,
  className,
  children,
  onClick
}: LandingButtonProps) {
  const withArrow = variant !== 'secondary' && variant !== 'onBlueOutline';
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(landingButtonVariants({ variant, fullWidthOnMobile, size }), className)}
    >
      {children}
      {withArrow ? (
        <span
          aria-hidden='true'
          className={cn(
            'flex size-7 items-center justify-center rounded-full transition-transform duration-200 group-hover:translate-x-0.5',
            variant === 'onBlue' ? 'bg-lp-blue text-white' : 'bg-white text-lp-blue-deep'
          )}
        >
          <Icons.arrowRight className='size-4' strokeWidth={2.5} />
        </span>
      ) : null}
    </Link>
  );
}
