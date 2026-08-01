export function PreBlock({ children }: { children: string }) {
    return (
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap wrap-break-word bg-subtle p-3 text-[0.75rem] leading-normal min-w-0">
            {children}
        </pre>
    );
}
