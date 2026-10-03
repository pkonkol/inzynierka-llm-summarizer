import { AppLink } from "./AppLink";
import { buttonClasses } from "./Button";

interface LinkButtonProps extends React.ComponentProps<"a"> {
  href: string;
}

export function LinkButton({ href, className, ...props }: LinkButtonProps) {
  return <AppLink href={href} {...props} className={buttonClasses("secondary", className)} />;
}
