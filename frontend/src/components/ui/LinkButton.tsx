import { navigateTo, shouldInterceptClick } from "../../utils/researchRouting";
import { buttonClasses } from "./Button";

interface LinkButtonProps extends React.ComponentProps<"a"> {
  href: string;
  size?: "sm" | "md";
}

// A real <a href>, so the row can be opened in a new tab, middle-clicked or copied as a link.
// Plain left-clicks are intercepted and routed client-side; every modifier click falls through
// to the browser.
export function LinkButton({ href, size = "md", className, onClick, ...props }: LinkButtonProps) {
  return (
    <a
      href={href}
      {...props}
      className={buttonClasses("secondary", size, className)}
      onClick={(event) => {
        onClick?.(event);
        if (!shouldInterceptClick(event)) return;
        event.preventDefault();
        navigateTo(href);
      }}
    />
  );
}
