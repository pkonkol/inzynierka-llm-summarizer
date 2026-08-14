import { cn } from "./cn";

// Wrapper scrolls instead of the page, so a wide table cannot push the layout sideways.
export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-base">
        <thead>
          <tr className="border-b border-panel-border">
            {headers.map((header, index) => (
              <Th key={header} className={index === headers.length - 1 ? "text-right" : undefined}>
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

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return <th scope="col" {...props} className={cn("px-3 py-2 font-medium", className)} />;
}

export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td {...props} className={cn("px-3 py-2", className)} />;
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr {...props} className={cn("border-b border-panel-border", className)} />;
}
