import { Icons } from '@/components/icons';

export function SupabaseConfigNotice({ message }: { message: string }) {
  return (
    <div
      role='alert'
      className='border-destructive/30 bg-destructive/10 flex items-start gap-2 rounded-lg border p-3 text-sm'
    >
      <Icons.warning className='text-destructive mt-0.5 size-4 shrink-0' aria-hidden='true' />
      <p className='text-foreground'>{message}</p>
    </div>
  );
}
