import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * The schema does not yet support inserting a human-authored message
 * (see `Unsupported features` in this phase's spec), so the composer is
 * disabled rather than faked with local-only state that would silently
 * disappear on refresh. Nothing here is ever saved.
 */
export function Composer({ conversationName }: { conversationName: string }) {
  return (
    <div className='bg-card sticky bottom-0 border-t p-3'>
      <div
        role='status'
        className='bg-muted/50 text-muted-foreground mb-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs'
      >
        <Icons.lock className='size-3.5 shrink-0' aria-hidden='true' />
        Human replies will be enabled in the next phase.
      </div>

      <div className='flex items-end gap-2'>
        <label htmlFor='inbox-composer' className='sr-only'>
          Message {conversationName}
        </label>
        <Textarea
          id='inbox-composer'
          disabled
          placeholder='Human replies will be enabled in the next phase'
          rows={2}
          className='max-h-32 min-h-[3rem] flex-1 resize-none'
        />
        <div className='flex shrink-0 items-center gap-1.5'>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  disabled
                  aria-label='Attach a file'
                />
              }
            >
              <Icons.paperclip className='size-4' />
            </TooltipTrigger>
            <TooltipContent>Attachments are coming in a future update</TooltipContent>
          </Tooltip>
          <Button type='button' size='icon' disabled aria-label='Send message'>
            <Icons.send className='size-4' aria-hidden='true' />
          </Button>
        </div>
      </div>
    </div>
  );
}
