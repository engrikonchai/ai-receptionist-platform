import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { WidgetPositionValue } from '../schemas/widget';

/**
 * A static, local mock of the floating launcher + chat panel — reflects
 * the form's current, unsaved values live (see WidgetSettingsForm's
 * `useStore` subscription), never calls the real widget runtime. This
 * is deliberately a fresh, lightweight visual approximation rather than
 * an iframe of the real embeddable widget (`/widget/[publicWidgetId]`):
 * that page always reflects the last *saved* settings (it's what real
 * visitors see), so it can't show an edit-in-progress value without
 * saving first, which is exactly what this preview is for.
 */
export function WidgetPreview({
  enabled,
  assistantName,
  welcomeMessage,
  primaryColor,
  position
}: {
  enabled: boolean;
  assistantName: string;
  welcomeMessage: string;
  primaryColor: string;
  position: WidgetPositionValue;
}) {
  const safeColor = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primaryColor)
    ? primaryColor
    : '#1677ff';
  const displayName = assistantName.trim() || 'Assistant';
  const displayWelcome =
    welcomeMessage.trim() || 'Ask us anything — we usually reply in a few minutes.';

  return (
    <div className='bg-muted/30 relative h-80 w-full overflow-hidden rounded-xl border sm:h-96'>
      <div className='text-muted-foreground absolute inset-x-0 top-0 flex items-center justify-between border-b bg-background/60 px-3 py-1.5 text-xs'>
        <span>Live preview</span>
        {!enabled && (
          <span className='text-destructive flex items-center gap-1 font-medium'>
            <Icons.alertCircle className='size-3.5' aria-hidden='true' />
            Widget disabled
          </span>
        )}
      </div>

      <div
        className={cn(
          'absolute bottom-4 flex w-[min(260px,80%)] flex-col overflow-hidden rounded-2xl border bg-background shadow-lg transition-opacity',
          position === 'bottom-left' ? 'left-4' : 'right-4',
          !enabled && 'opacity-50'
        )}
      >
        <div
          className='flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-white'
          style={{ backgroundColor: safeColor }}
        >
          <Icons.chat className='size-4' aria-hidden='true' />
          <span className='truncate'>{displayName}</span>
        </div>
        <div className='space-y-2 p-3'>
          <div className='bg-muted max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-xs'>
            {displayWelcome}
          </div>
        </div>
        <div className='flex items-center gap-2 border-t p-2'>
          <div className='text-muted-foreground bg-muted/60 h-7 flex-1 rounded-full px-3 text-xs leading-7'>
            Type a message…
          </div>
          <div
            className='flex size-7 shrink-0 items-center justify-center rounded-full text-white'
            style={{ backgroundColor: safeColor }}
          >
            <Icons.arrowRight className='size-3.5' aria-hidden='true' />
          </div>
        </div>
      </div>

      <div
        className={cn(
          'absolute bottom-4 flex size-11 items-center justify-center rounded-full text-white shadow-lg',
          position === 'bottom-left' ? 'left-[min(280px,84%)]' : 'right-[min(280px,84%)]'
        )}
        style={{ backgroundColor: safeColor }}
        aria-hidden='true'
      >
        <Icons.chat className='size-5' />
      </div>
    </div>
  );
}
