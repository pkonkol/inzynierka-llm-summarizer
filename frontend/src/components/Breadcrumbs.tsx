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
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption"
    >
      {trail.map((crumb, index) => (
        <span key={crumb.href} className="flex items-center gap-x-2">
          {index > 0 ? (
            <span aria-hidden="true" className="text-stone">
              /
            </span>
          ) : null}
          <AppLink href={crumb.href} className="text-mute">
            {crumb.label}
          </AppLink>
        </span>
      ))}
    </nav>
  );
}
