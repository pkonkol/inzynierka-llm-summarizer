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
  "bg-page",
  "bg-panel-solid",
  "bg-subtle",
  "bg-subtle-hover",
  "bg-selected-bg",
  "bg-accent-50",
  "bg-accent-500",
  "bg-accent-700",
  "bg-ink",
  "bg-success",
  "bg-success-bg",
  "bg-danger",
  "bg-danger-bg",
  "bg-warning",
  "bg-warning-bg",
  "bg-link",
];

const TYPE_STEPS = [
  "text-hero",
  "text-2xl",
  "text-xl",
  "text-lg",
  "text-base",
  "text-md",
  "text-sm",
  "text-xs",
  "text-2xs",
];

const SPACING_STEPS = [1, 2, 3, 4, 6, 8, 12, 16];
const BUTTON_VARIANTS = ["primary", "secondary", "danger", "dangerOutline", "ghost"] as const;
const BUTTON_SIZES = ["xs", "sm", "md", "lg"] as const;
const PANEL_PADDINGS = ["xs", "sm", "md", "lg", "xl"] as const;
const TONES = ["success", "danger", "warning"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="grid gap-4">
      <SectionHeading>{title}</SectionHeading>
      {children}
    </Panel>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <div className="border border-panel-border">
      <div className={`h-12 ${token}`} />
      <p className="m-0 border-t border-panel-border px-2 py-1 font-mono text-2xs">{token}</p>
    </div>
  );
}

function TypeStep({ token }: { token: string }) {
  return (
    <div className="flex items-baseline gap-4 border-b border-panel-border pb-2">
      <span className="w-24 shrink-0 font-mono text-2xs text-muted">{token}</span>
      <span className={token}>Zażółć gęślą jaźń</span>
    </div>
  );
}

function SpacingStep({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-24 shrink-0 font-mono text-2xs text-muted">
        {step} · {step * 4}px
      </span>
      <div className="h-4 bg-accent-700" style={{ width: `${step * 4}px` }} />
    </div>
  );
}

function ButtonRow({ variant }: { variant: (typeof BUTTON_VARIANTS)[number] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 font-mono text-2xs text-muted">{variant}</span>
      {BUTTON_SIZES.map((size) => (
        <Button key={size} variant={variant} size={size}>
          {size}
        </Button>
      ))}
      <Button variant={variant} disabled>
        disabled
      </Button>
    </div>
  );
}

export function DesignPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <PageShell>
      <div className="grid gap-2">
        <h1 className="m-0 font-mono text-xl uppercase tracking-wider">Design system</h1>
        <p className="helper-copy">
          Every primitive and token, rendered from the same source the app uses.
        </p>
      </div>

      <Section title="Colour">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {SWATCHES.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="grid gap-2">
          {TYPE_STEPS.map((token) => (
            <TypeStep key={token} token={token} />
          ))}
        </div>
        <div className="grid gap-1">
          <p className="section-kicker">section-kicker</p>
          <p className="helper-copy">helper-copy — body text at the default step.</p>
          <SectionHeading>SectionHeading</SectionHeading>
        </div>
      </Section>

      <Section title="Spacing">
        <p className="helper-copy">Preferred steps. Anything outside this set needs a reason.</p>
        <div className="grid gap-2">
          {SPACING_STEPS.map((step) => (
            <SpacingStep key={step} step={step} />
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="grid gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <ButtonRow key={variant} variant={variant} />
          ))}
        </div>
      </Section>

      <Section title="Panels">
        <div className="grid gap-3 md:grid-cols-3">
          {PANEL_PADDINGS.map((padding) => (
            <Panel key={padding} padding={padding} className="bg-subtle">
              <span className="font-mono text-2xs text-muted">padding={padding}</span>
            </Panel>
          ))}
        </div>
      </Section>

      <Section title="Alerts and badges">
        <div className="grid gap-2">
          {TONES.map((tone) => (
            <Alert key={tone} tone={tone}>
              Alert with tone={tone}
            </Alert>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
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
          <div className="grid gap-2">
            <FieldLabel htmlFor="design-input">Input</FieldLabel>
            <Input id="design-input" placeholder="https://example.com" />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="design-input-disabled">Input (disabled)</FieldLabel>
            <Input id="design-input-disabled" placeholder="disabled" disabled />
          </div>
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor="design-textarea">Textarea</FieldLabel>
          <Textarea id="design-textarea" rows={4} placeholder="Treść…" />
        </div>
      </Section>

      <Section title="Overlays and disclosure">
        <div className="justify-self-start">
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            Open modal
          </Button>
        </div>
        <Modal isOpen={isModalOpen} title="Modal title">
          <p className="helper-copy">Body of the dialog.</p>
          <Button onClick={() => setIsModalOpen(false)}>Close</Button>
        </Modal>
        <Collapsible label="Collapsible">
          <p className="helper-copy p-3">Hidden content.</p>
        </Collapsible>
      </Section>
    </PageShell>
  );
}
