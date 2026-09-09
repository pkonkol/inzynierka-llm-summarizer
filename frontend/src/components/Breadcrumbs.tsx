import { AppLink } from "./ui/AppLink";

export interface Crumb {
  label: string;
  href: string;
}

// Only the ancestors: the page's own <h1> already names where you are.
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  return (
    <nav
      aria-label="Ścieżka nawigacji"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted"
    >
      {trail.map((crumb, index) => (
        <span key={crumb.href} className="flex items-center gap-x-2">
          {index > 0 ? <span aria-hidden="true">›</span> : null}
          <AppLink href={crumb.href} className="text-link">
            {crumb.label}
          </AppLink>
        </span>
      ))}
    </nav>
  );
}
