/** Shared Zendren attribution footer. */
export function SiteFooter({ className = '' }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`site-footer border-t border-surface-light py-5 text-xs sm:text-sm text-text-secondary ${className}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p>
          © {year}{' '}
          <a href="https://zendren.net" className="underline-offset-2 hover:underline hover:text-text-primary">
            Zendren
          </a>
        </p>
        <nav aria-label="Legal" className="flex gap-4">
          <a href="/privacy#privacy" className="underline-offset-2 hover:underline hover:text-text-primary">
            Privacy
          </a>
          <a href="/privacy#app-use" className="underline-offset-2 hover:underline hover:text-text-primary">
            Terms
          </a>
        </nav>
      </div>
    </footer>
  );
}
