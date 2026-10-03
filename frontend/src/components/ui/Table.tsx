import { cn } from "./cn";

// Wrapper scrolls instead of the page, so a wide table cannot push the layout sideways.
interface TableProps {
  headers: string[];
  /** Headers of numeric columns; their cells take `text-right` at the call site. The last column is always right-aligned. */
  alignRight?: string[];
  children: React.ReactNode;
}

export function Table({ headers, alignRight = [], children }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left tabular-nums">
        <thead className="text-caption text-mute">
          <tr className="border-b border-hairline-strong">
            {headers.map((header, index) => (
              <Th
                key={header}
                className={
                  index === headers.length - 1 || alignRight.includes(header)
                    ? "text-right"
                    : undefined
                }
              >
                {header}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Th({ className, ...props }: React.ComponentProps<"th">) {
  return <th scope="col" {...props} className={cn("px-3 py-2 font-normal", className)} />;
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td {...props} className={cn("px-3 py-2", className)} />;
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr {...props} className={cn("border-b border-hairline", className)} />;
}
