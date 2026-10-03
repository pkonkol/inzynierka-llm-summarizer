import { useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useFlash } from "../components/FlashProvider";
import { StatusLabel } from "../components/StatusLabel";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Checkbox } from "../components/ui/Checkbox";
import { Collapsible } from "../components/ui/Collapsible";
import { DisclosureButton } from "../components/ui/DisclosureButton";
import {
  FieldError,
  FieldLabel,
  Input,
  RangeInput,
  Select,
  Textarea,
} from "../components/ui/Field";
import { LinkButton } from "../components/ui/LinkButton";
import { PageSection, PageShell } from "../components/ui/PageShell";
import { PreBlock } from "../components/ui/PreBlock";
import { Table, Td, Tr } from "../components/ui/Table";
import { HelpTip, Tooltip } from "../components/ui/Tooltip";
import { EVALUATION_SETS_PATH } from "../utils/routing";

// Tailwind only emits classes it can find as literal strings, so every swatch class is spelled out.
// Hex values and ratios mirror the DESIGN.md front matter.
const SWATCHES = [
  { token: "ink", swatch: "bg-ink", hex: "#201d1d", note: "16.3:1 · tekst, primary, linki" },
  { token: "body", swatch: "bg-body", hex: "#424245", note: "9.8:1 · dłuższy tekst" },
  { token: "mute", swatch: "bg-mute", hex: "#646262", note: "5.9:1 · etykiety, metadane" },
  { token: "stone", swatch: "bg-stone", hex: "#6e6e73", note: "5.0:1 · separatory" },
  { token: "ash", swatch: "bg-ash", hex: "#9a9898", note: "2.8:1 · tylko wyłączone" },
  { token: "canvas", swatch: "bg-canvas", hex: "#fdfcfc", note: "jedyne tło strony" },
  { token: "surface-soft", swatch: "bg-surface-soft", hex: "#f8f7f7", note: "tło pól" },
  { token: "surface-card", swatch: "bg-surface-card", hex: "#f1eeee", note: "snippet, szkielet" },
  { token: "surface-dark", swatch: "bg-surface-dark", hex: "#201d1d", note: "chip, toast" },
  { token: "hairline", swatch: "bg-hairline", hex: "rgb(15 0 0 / .12)", note: "linie sekcji" },
  { token: "hairline-strong", swatch: "bg-hairline-strong", hex: "#646262", note: "granice pól" },
  { token: "accent-hover", swatch: "bg-accent-hover", hex: "#0056b3", note: "6.9:1 · informacja" },
  { token: "warning-active", swatch: "bg-warning-active", hex: "#995f06", note: "5.1:1 · w toku" },
  { token: "danger-hover", swatch: "bg-danger-hover", hex: "#d70015", note: "5.3:1 · błąd" },
  { token: "success", swatch: "bg-success", hex: "#30d158", note: "8.3:1 tylko na ciemnym" },
];

const TYPE_SCALE = [
  { name: "display 36/700", className: "text-display font-bold" },
  { name: "title 24/700", className: "text-title font-bold" },
  { name: "subtitle 20/700", className: "text-subtitle font-bold" },
  { name: "heading 16/700", className: "text-reading font-bold" },
  { name: "reading 16/400", className: "font-reading text-reading" },
  { name: "ui 15/400", className: "text-ui" },
  { name: "strong 15/500", className: "text-button font-medium" },
  { name: "caption 13/400", className: "text-caption text-mute" },
];

const STATUSES = ["completed", "failed", "pending", "running"] as const;
const TONES = ["danger", "warning", "success"] as const;

const SAMPLE_PROVIDER_ERROR =
  "Job zakończył się błędem: Error calling model 'gemini-flash-lite-latest' (INVALID_ARGUMENT): 400 INVALID_ARGUMENT. {'error': {'code': 400, 'message': 'API key not valid. Please pass a valid API key.', 'status': 'INVALID_ARGUMENT'}}";

export function DesignPage() {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDisclosureOpen, setIsDisclosureOpen] = useState(false);
  const [density, setDensity] = useState(0.5);
  const showFlash = useFlash();

  return (
    <PageShell>
      <div className="grid gap-section">
        <h1 className="text-title">/design</h1>

        <PageSection title="Kolory">
          <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {SWATCHES.map(({ token, swatch, hex, note }) => (
              <li key={token} className="grid gap-2">
                <div className={`h-10 rounded-sm border border-hairline ${swatch}`} />
                <div className="grid">
                  <span className="font-medium">{token}</span>
                  <span className="text-caption text-mute">
                    {hex} · {note}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </PageSection>

        <PageSection title="Typografia">
          <div className="grid gap-3">
            {TYPE_SCALE.map(({ name, className }) => (
              <p key={name} className={className}>
                {name} — Zażółć gęślą jaźń
              </p>
            ))}
            <p>
              <a href="#typografia">link w tekście</a> — tusz i podkreślenie
            </p>
          </div>
        </PageSection>

        <PageSection title="Przyciski i pola">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button disabled>Przetwarzanie...</Button>
            <LinkButton href={EVALUATION_SETS_PATH}>LinkButton</LinkButton>
          </div>
          <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <FieldLabel htmlFor="design-input">Input</FieldLabel>
              <Input id="design-input" placeholder="placeholder" />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="design-input-error">Input z błędem</FieldLabel>
              <Input
                id="design-input-error"
                defaultValue="abc"
                aria-invalid="true"
                aria-describedby="design-input-error-message"
              />
              <FieldError id="design-input-error-message">Wymagana liczba 20–600</FieldError>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="design-select">Select</FieldLabel>
              <Select id="design-select">
                <option>Opcja</option>
              </Select>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="design-input-disabled">Wyłączone</FieldLabel>
              <Input id="design-input-disabled" placeholder="nieedytowalne" disabled />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <FieldLabel htmlFor="design-textarea">Textarea</FieldLabel>
              <Textarea id="design-textarea" rows={3} placeholder="Treść…" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox defaultChecked>Checkbox</Checkbox>
              <HelpTip description="HelpTip: [?] obok etykiety zastępuje atrybut title. Esc chowa opis." />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="design-range">RangeInput — {density.toFixed(2)}</FieldLabel>
              <RangeInput
                id="design-range"
                min={0}
                max={1}
                step={0.05}
                value={density}
                onChange={(event) => setDensity(Number(event.target.value))}
              />
            </div>
          </div>
        </PageSection>

        <PageSection title="Stany">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {STATUSES.map((status) => (
              <StatusLabel key={status} status={status} />
            ))}
            <StatusLabel status="completed" count={4} />
          </div>
          <div className="grid gap-2">
            {TONES.map((tone) => (
              <Alert key={tone} tone={tone}>
                Alert tone={tone}
              </Alert>
            ))}
          </div>
        </PageSection>

        <PageSection title="Odsłanianie i nakładki">
          <div className="grid">
            <DisclosureButton
              label="DisclosureButton"
              isOpen={isDisclosureOpen}
              onToggle={() => setIsDisclosureOpen((value) => !value)}
            />
            {isDisclosureOpen ? <PreBlock>Odsłonięta treść w snippecie.</PreBlock> : null}
            <Collapsible label="Collapsible">
              <PreBlock>Treść schowana pod [+].</PreBlock>
            </Collapsible>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setIsConfirmOpen(true)}>ConfirmDialog</Button>
            <Button onClick={() => showFlash("Zapisano")}>Toast</Button>
            <Button onClick={() => showFlash(SAMPLE_PROVIDER_ERROR, "danger")}>
              Toast z błędem
            </Button>
            <Tooltip description="Opis pokazywany przy najechaniu i fokusie; Esc go chowa.">
              {(describedBy) => <Button aria-describedby={describedBy}>Tooltip</Button>}
            </Tooltip>
          </div>
          <ConfirmDialog
            isOpen={isConfirmOpen}
            title="Usunąć job?"
            message="Usunąć „Upadek Lehman Brothers” (https://www.nytimes.com/2008/09/15/business/15lehman.html)?"
            onClose={() => setIsConfirmOpen(false)}
            onConfirm={() => {
              setIsConfirmOpen(false);
              showFlash("Usunięto");
            }}
          />
        </PageSection>

        <PageSection title="Tabela">
          <Table headers={["Model", "Status", "Wpisów"]}>
            <Tr>
              <Td>gemini:gemini-2.5-flash</Td>
              <Td>
                <StatusLabel status="completed" />
              </Td>
              <Td className="text-right">50</Td>
            </Tr>
            <Tr>
              <Td>ollama:qwen3:8b</Td>
              <Td>
                <StatusLabel status="running" />
              </Td>
              <Td className="text-right">12</Td>
            </Tr>
          </Table>
        </PageSection>
      </div>
    </PageShell>
  );
}
