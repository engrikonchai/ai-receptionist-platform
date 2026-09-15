import PageContainer from '@/components/layout/page-container';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Simple placeholder for dashboard routes that don't have their
 * feature implementation yet. Intentionally minimal — no invented
 * functionality or fake data, just a marker that the route exists
 * and is reserved for a future build phase.
 */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <PageContainer pageTitle={title} pageDescription={description}>
      <Card>
        <CardContent className='flex flex-col items-start gap-2 py-10'>
          <Badge variant='outline'>Coming in the next development phase</Badge>
          <p className='text-muted-foreground max-w-prose text-sm'>
            The {title} page will be built in an upcoming phase of the AI receptionist platform.
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
