import { Icons } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeModeToggle } from '@/components/themes/theme-mode-toggle';

export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className='bg-background flex min-h-svh flex-col'>
      <header className='flex items-center justify-between p-4'>
        <div className='text-foreground flex items-center gap-2 text-sm font-semibold'>
          <Icons.logo className='size-5' aria-hidden='true' />
          Platform
        </div>
        <ThemeModeToggle />
      </header>

      <main className='flex flex-1 items-start justify-center p-4 pb-16 sm:items-center'>
        <Card className='w-full max-w-xl'>
          <CardContent className='pt-6'>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
