import { navigateTo, shouldInterceptClick } from "../../utils/routing";

interface AppLinkProps extends React.ComponentProps<"a"> {
  href: string;
}

// The one implementation of client-side routing on a link. It stays a real <a href>, so the
// row can be opened in a new tab, middle-clicked or copied; only a plain left-click is handled
// here, and every modifier click falls through to the browser.
export function AppLink({ href, onClick, ...props }: AppLinkProps) {
  return (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!shouldInterceptClick(event)) return;
        event.preventDefault();
        navigateTo(href);
      }}
    />
  );
}
