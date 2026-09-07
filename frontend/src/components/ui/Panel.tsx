import { cn } from "./cn";

const PADDING = {
  sm: "px-3 py-3",
  md: "p-4",
  xl: "p-8",
} as const;

interface PanelProps extends React.ComponentProps<"div"> {
  padding?: keyof typeof PADDING;
  as?: "div" | "section";
}

export function Panel({ padding = "md", as: Tag = "div", className, ...props }: PanelProps) {
  return (
    <Tag
      {...props}
      className={cn(
        "min-w-0 overflow-clip border border-panel-border bg-panel-solid",
        PADDING[padding],
        className,
      )}
    />
  );
}
