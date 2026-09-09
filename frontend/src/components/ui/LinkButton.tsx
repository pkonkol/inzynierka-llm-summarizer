import { AppLink } from "./AppLink";
import { type ButtonSize, buttonClasses } from "./Button";

interface LinkButtonProps extends React.ComponentProps<"a"> {
  href: string;
  size?: ButtonSize;
}

export function LinkButton({ href, size = "md", className, ...props }: LinkButtonProps) {
  return <AppLink href={href} {...props} className={buttonClasses("secondary", size, className)} />;
}
