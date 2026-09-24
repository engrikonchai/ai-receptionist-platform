export function LandingLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <svg viewBox='0 0 32 32' className='size-8' aria-hidden='true'>
        <circle cx='16' cy='16' r='16' className='fill-lp-sun' />
        <path
          d='M9.5 11.5a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H15l-3.6 3v-3h-.9a3 3 0 0 1-3-3v-5Z'
          className='fill-lp-ink'
        />
        <circle cx='13' cy='14' r='1.15' className='fill-lp-sun' />
        <circle cx='16' cy='14' r='1.15' className='fill-lp-sun' />
        <circle cx='19' cy='14' r='1.15' className='fill-lp-sun' />
      </svg>
      <span className='text-lp-ink text-lg font-extrabold tracking-tight'>Platform</span>
    </span>
  );
}
