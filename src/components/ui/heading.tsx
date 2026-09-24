import { InfoButton } from '@/components/ui/info-button';
import type { InfobarContent } from '@/components/ui/infobar';

interface HeadingProps {
  title: string;
  description: string;
  infoContent?: InfobarContent;
}

export function Heading({ title, description, infoContent }: HeadingProps) {
  return (
    <div className='min-w-0'>
      {/* `min-w-0`: without it, this flex row's automatic minimum size is
          the `truncate` (nowrap) title's full, un-truncated width — the
          classic flex/truncate bug where `overflow:hidden` never actually
          engages because the row is never given a chance to be narrower
          than the text. A long real business name/owner name otherwise
          forces the whole shell wider than the viewport instead of
          ellipsizing as intended. */}
      <div className='flex min-w-0 items-center gap-2'>
        <h1 className='font-display truncate text-[28px] leading-tight font-semibold sm:text-[34px]'>
          {title}
        </h1>
        {infoContent && (
          <div className='shrink-0 pt-1'>
            <InfoButton content={infoContent} />
          </div>
        )}
      </div>
      <p className='text-muted-foreground mt-1 max-w-2xl text-[15px] leading-relaxed wrap-break-word'>
        {description}
      </p>
    </div>
  );
}
