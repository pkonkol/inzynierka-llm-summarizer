import { cn } from "./cn";

export function PageShell({ className, ...props }: React.ComponentProps<"main">) {
    return (
        <main
            {...props}
            className={cn("mx-auto grid w-full max-w-355 gap-4 px-3.5 py-7", className)}
        />
    );
}

export function SectionHeading({ className, ...props }: React.ComponentProps<"h6">) {
    return (
        <h6
            {...props}
            className={cn(
                "m-0 font-mono text-xs font-semibold uppercase tracking-wider text-muted",
                className,
            )}
        />
    );
}
