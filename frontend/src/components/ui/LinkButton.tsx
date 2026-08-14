import { navigateTo } from "../../utils/researchRouting";
import { type ButtonSize, type ButtonVariant, buttonClasses } from "./Button";

interface LinkButtonProps extends React.ComponentProps<"a"> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// A real <a href>, so the row can be opened in a new tab, middle-clicked or copied as a link.
// Plain left-clicks are intercepted and routed client-side; every modifier click falls through
// to the browser.
export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  onClick,
  ...props
}: LinkButtonProps) {
  return (
    <a
      href={href}
      {...props}
      className={buttonClasses(variant, size, className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigateTo(href);
      }}
    />
  );
}
