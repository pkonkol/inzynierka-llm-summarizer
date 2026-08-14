import { useState } from "react";

import { Collapsible } from "../components/Collapsible";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { FieldLabel, Input, Textarea } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { PageShell, SectionHeading } from "../components/ui/PageShell";
import { Panel } from "../components/ui/Panel";

// Tailwind only emits classes it can find as literal strings, so every swatch is spelled out.
const SWATCHES = [
    ["bg-page", "bg-page"],
    ["bg-panel-solid", "bg-panel-solid"],
    ["bg-subtle", "bg-subtle"],
    ["bg-subtle-hover", "bg-subtle-hover"],
    ["bg-selected-bg", "bg-selected-bg"],
    ["bg-accent-50", "bg-accent-50"],
    ["bg-accent-500", "bg-accent-500"],
    ["bg-accent-700", "bg-accent-700"],
    ["bg-ink", "bg-ink"],
    ["bg-success", "bg-success"],
    ["bg-success-bg", "bg-success-bg"],
    ["bg-danger", "bg-danger"],
    ["bg-danger-bg", "bg-danger-bg"],
    ["bg-warning", "bg-warning"],
    ["bg-warning-bg", "bg-warning-bg"],
    ["bg-link", "bg-link"],
];

const TYPE_STEPS = [
    ["text-hero", "text-hero"],
    ["text-2xl", "text-2xl"],
    ["text-xl", "text-xl"],
    ["text-lg", "text-lg"],
    ["text-base", "text-base"],
    ["text-md", "text-md"],
    ["text-sm", "text-sm"],
    ["text-xs", "text-xs"],
    ["text-2xs", "text-2xs"],
];

const BUTTON_VARIANTS = ["primary", "secondary", "danger", "dangerOutline", "ghost"] as const;
const BUTTON_SIZES = ["sm", "md", "lg", "xl"] as const;
const TONES = ["success", "danger", "warning"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Panel>
            <SectionHeading className="mb-4">{title}</SectionHeading>
            {children}
        </Panel>
    );
}

export function DesignPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <PageShell>
            <h1 className="m-0 font-mono text-xl uppercase tracking-wider">Design system</h1>
            <p className="helper-copy">
                Every primitive and token, rendered from the same source the app uses.
            </p>

            <Section title="Colour">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {SWATCHES.map(([label, cls]) => (
                        <div key={label} className="border border-panel-border">
                            <div className={`h-12 ${cls}`} />
                            <p className="m-0 border-t border-panel-border px-2 py-1 font-mono text-2xs">
                                {label}
                            </p>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Typography">
                <div className="space-y-2">
                    {TYPE_STEPS.map(([label, cls]) => (
                        <div
                            key={label}
                            className="flex items-baseline gap-4 border-b border-panel-border pb-2"
                        >
                            <span className="w-24 shrink-0 font-mono text-2xs text-muted">
                                {label}
                            </span>
                            <span className={cls}>Zażółć gęślą jaźń</span>
                        </div>
                    ))}
                </div>
                <div className="mt-4 space-y-1">
                    <p className="section-kicker">section-kicker</p>
                    <p className="helper-copy">helper-copy — body text at the default step.</p>
                    <SectionHeading>SectionHeading</SectionHeading>
                </div>
            </Section>

            <Section title="Buttons">
                <div className="space-y-3">
                    {BUTTON_VARIANTS.map((variant) => (
                        <div key={variant} className="flex flex-wrap items-center gap-2">
                            <span className="w-28 shrink-0 font-mono text-2xs text-muted">
                                {variant}
                            </span>
                            {BUTTON_SIZES.map((size) => (
                                <Button key={size} variant={variant} size={size}>
                                    {size}
                                </Button>
                            ))}
                            <Button variant={variant} disabled>
                                disabled
                            </Button>
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Panels">
                <div className="grid gap-3 md:grid-cols-3">
                    {(["sm", "md", "lg", "xl"] as const).map((padding) => (
                        <Panel key={padding} padding={padding} className="bg-subtle">
                            <span className="font-mono text-2xs text-muted">padding={padding}</span>
                        </Panel>
                    ))}
                </div>
            </Section>

            <Section title="Alerts and badges">
                <div className="space-y-2">
                    {TONES.map((tone) => (
                        <Alert key={tone} tone={tone}>
                            Alert with tone={tone}
                        </Alert>
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Badge>neutral</Badge>
                    {TONES.map((tone) => (
                        <Badge key={tone} tone={tone}>
                            {tone}
                        </Badge>
                    ))}
                </div>
            </Section>

            <Section title="Form fields">
                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <FieldLabel htmlFor="design-input">Input</FieldLabel>
                        <Input id="design-input" placeholder="https://example.com" />
                    </div>
                    <div>
                        <FieldLabel htmlFor="design-input-disabled">Input (disabled)</FieldLabel>
                        <Input id="design-input-disabled" placeholder="disabled" disabled />
                    </div>
                </div>
                <div className="mt-4">
                    <FieldLabel htmlFor="design-textarea">Textarea</FieldLabel>
                    <Textarea id="design-textarea" rows={4} placeholder="Treść…" />
                </div>
            </Section>

            <Section title="Overlays and disclosure">
                <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                    Open modal
                </Button>
                <Modal isOpen={isModalOpen} title="Modal title">
                    <p className="helper-copy mb-4">Body of the dialog.</p>
                    <Button onClick={() => setIsModalOpen(false)}>Close</Button>
                </Modal>
                <div className="mt-4">
                    <Collapsible label="Collapsible">
                        <p className="helper-copy p-3">Hidden content.</p>
                    </Collapsible>
                </div>
            </Section>
        </PageShell>
    );
}
