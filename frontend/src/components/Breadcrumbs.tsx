import { navigateTo, shouldInterceptClick } from "../utils/routing";

interface Crumb {
  label: string;
  href: string;
}

/** `trail` is every ancestor, in order; `current` names the page you are on and is not a link. */
export function Breadcrumbs({ trail, current }: { trail: Crumb[]; current: string }) {
  return (
    <nav
      aria-label="Ścieżka nawigacji"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted"
    >
      {trail.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-x-2">
          <a
            href={crumb.href}
            className="text-link"
            onClick={(event) => {
              if (!shouldInterceptClick(event)) return;
              event.preventDefault();
              navigateTo(crumb.href);
            }}
          >
            {crumb.label}
          </a>
          <span aria-hidden="true">›</span>
        </span>
      ))}
      <span aria-current="page" className="mono-value text-ink">
        {current}
      </span>
    </nav>
  );
}

export const EVALUATION_TRAIL: Crumb[] = [
  { label: "Ewaluacja", href: "/research/import" },
  { label: "Zbiory", href: "/research" },
];
