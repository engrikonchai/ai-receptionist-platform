/** The Platform mark — a blue disc with a chat bubble, matching the public landing page. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 32 32' className={className} aria-hidden='true'>
      <circle cx='16' cy='16' r='16' className='fill-primary' />
      <path
        d='M9.5 11.5a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H15l-3.6 3v-3h-.9a3 3 0 0 1-3-3v-5Z'
        className='fill-primary-foreground'
      />
      <circle cx='13' cy='14' r='1.15' className='fill-primary' />
      <circle cx='16' cy='14' r='1.15' className='fill-primary' />
      <circle cx='19' cy='14' r='1.15' className='fill-primary' />
    </svg>
  );
}
