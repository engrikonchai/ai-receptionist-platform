import Link from 'next/link';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeModeToggle } from '@/components/themes/theme-mode-toggle';

export function AuthShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className='bg-background flex min-h-svh flex-col'>
      <header className='flex items-center justify-between p-4'>
        <Link href='/' className='text-foreground flex items-center gap-2 text-sm font-semibold'>
          <Icons.logo className='size-5' aria-hidden='true' />
          Platform
        </Link>
        <ThemeModeToggle />
      </header>

      <main className='flex flex-1 items-center justify-center p-4 pb-16'>
        <Card className='w-full max-w-sm'>
          <CardHeader>
            <CardTitle className='text-xl'>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
