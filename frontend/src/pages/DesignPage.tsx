import { useState } from "react";
import { Collapsible } from "../components/Collapsible";
import { useFlash } from "../components/FlashProvider";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { DisclosureButton } from "../components/ui/DisclosureButton";
import { FieldLabel, Input, Textarea } from "../components/ui/Field";
import { LinkButton } from "../components/ui/LinkButton";
import { Modal } from "../components/ui/Modal";
import { PageShell, SectionHeading } from "../components/ui/PageShell";
import { Panel } from "../components/ui/Panel";
import { Tooltip } from "../components/ui/Tooltip";
import { EVALUATION_SETS_PATH } from "../utils/routing";

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

// Elements, not utilities: this is the scale components are supposed to reach for.
const HEADING_LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const SPACING_STEPS = [1, 2, 3, 4, 6, 8, 12, 16];
const BUTTON_VARIANTS = ["primary", "secondary", "danger", "dangerOutline", "ghost"] as const;
const BUTTON_SIZES = ["xs", "sm", "md", "lg"] as const;
const PANEL_PADDINGS = ["sm", "md", "xl"] as const;
const TONES = ["success", "danger", "warning"] as const;

const SAMPLE_PROVIDER_ERROR =
  "Job zakończył się błędem: Error calling model 'gemini-flash-lite-latest' (INVALID_ARGUMENT): 400 INVALID_ARGUMENT. {'error': {'code': 400, 'message': 'API key not valid. Please pass a valid API key.', 'status': 'INVALID_ARGUMENT'}}";

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
      <p className="border-t border-panel-border px-2 py-1 mono-value">{token}</p>
    </div>
  );
}

function HeadingStep({ level }: { level: (typeof HEADING_LEVELS)[number] }) {
  const Tag = level;
  return (
    <div className="flex items-baseline gap-4 border-b border-panel-border pb-2">
      <span className="mono-value w-24 shrink-0 text-muted">{level}</span>
      <Tag>Zażółć gęślą jaźń</Tag>
    </div>
  );
}

function SpacingStep({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-4">
      <span className="mono-value w-24 shrink-0 text-muted">
        {step} · {step * 4}px
      </span>
      <div className="h-4 bg-accent-700" style={{ width: `${step * 4}px` }} />
    </div>
  );
}

function ButtonRow({ variant }: { variant: (typeof BUTTON_VARIANTS)[number] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mono-value w-28 shrink-0 text-muted">{variant}</span>
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
  const [isDisclosureOpen, setIsDisclosureOpen] = useState(false);
  const showFlash = useFlash();

  return (
    <PageShell>
      <div className="grid gap-2">
        <h1>Design system</h1>
        <p className="text-muted">
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
        <p className="text-muted">
          Typography is carried by the element. h1–h6 share one family and weight and differ only in
          size, so a component sets no typography class of its own.
        </p>
        <div className="grid gap-2">
          {HEADING_LEVELS.map((level) => (
            <HeadingStep key={level} level={level} />
          ))}
        </div>
        <div className="grid gap-1">
          <p>p — body text at the default step.</p>
          <p className="text-muted">p.text-muted — the same step, secondary colour.</p>
          <a href="/design">a — a link inside running text.</a>
          <p>
            <span className="mono-value">mono-value</span> — URLs, model ids, metric numbers.
          </p>
          <code>code, pre, kbd — raw output and prompts.</code>
          <span className="label-caps text-muted">label-caps — the name of a machine field</span>
          <SectionHeading>SectionHeading renders an h4.</SectionHeading>
        </div>
        <p className="hero-title">hero-title</p>
      </Section>

      <Section title="Spacing">
        <p className="text-muted">Preferred steps. Anything outside this set needs a reason.</p>
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
              <span className="mono-value text-muted">padding={padding}</span>
            </Panel>
          ))}
        </div>
      </Section>

      <Section title="Alerts">
        <div className="grid gap-2">
          {TONES.map((tone) => (
            <Alert key={tone} tone={tone}>
              Alert with tone={tone}
            </Alert>
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

      <Section title="Notifications">
        <p className="text-muted">
          Transient events land in a Toast; page state stays in an Alert in the flow. A long message
          keeps its first sentence and hides the rest.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => showFlash("Podsumowanie gotowe.")}>
            success
          </Button>
          <Button
            size="sm"
            variant="dangerOutline"
            onClick={() => showFlash(SAMPLE_PROVIDER_ERROR, "danger")}
          >
            danger, długi
          </Button>
        </div>
      </Section>

      <Section title="Links and disclosure">
        <p className="text-muted">
          LinkButton renders an anchor, so it can be opened in a new tab. DisclosureButton carries
          aria-expanded.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton size="sm" href={EVALUATION_SETS_PATH}>
            LinkButton
          </LinkButton>
          <Tooltip description="Tooltip is CSS only, so it also opens on keyboard focus. It owns the description id and hands it to the trigger.">
            {(describedBy) => (
              <Button size="sm" aria-describedby={describedBy}>
                Tooltip — hover or focus
              </Button>
            )}
          </Tooltip>
        </div>
        <DisclosureButton
          label="DisclosureButton"
          isOpen={isDisclosureOpen}
          onToggle={() => setIsDisclosureOpen((value) => !value)}
        />
        {isDisclosureOpen ? <p className="text-muted">Revealed content.</p> : null}
      </Section>

      <Section title="Overlays and disclosure">
        <div className="justify-self-start">
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            Open modal
          </Button>
        </div>
        <Modal isOpen={isModalOpen} title="Modal title" onClose={() => setIsModalOpen(false)}>
          <p className="text-muted">Body of the dialog.</p>
          <Button onClick={() => setIsModalOpen(false)}>Close</Button>
        </Modal>
        <Collapsible label="Collapsible">
          <p className="p-3 text-muted">Hidden content.</p>
        </Collapsible>
      </Section>
    </PageShell>
  );
}
