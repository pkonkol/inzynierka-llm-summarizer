import { cn } from "./cn";

const PADDING = {
    none: "",
    xs: "px-3 py-2",
    sm: "px-3.5 py-3",
    md: "p-4.5",
    lg: "p-6",
    xl: "p-8",
} as const;

interface PanelProps extends React.ComponentProps<"div"> {
    padding?: keyof typeof PADDING;
    as?: "div" | "section" | "article" | "aside";
}

export function Panel({ padding = "md", as: Tag = "div", className, ...props }: PanelProps) {
    return (
        <Tag
            {...props}
            className={cn(
                "min-w-0 overflow-hidden border border-panel-border bg-panel-solid",
                PADDING[padding],
                className,
            )}
        />
    );
}
