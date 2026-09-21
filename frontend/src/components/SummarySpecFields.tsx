import { useId } from "react";
import type { SummarySpec } from "../types/api.generated";
import {
  FUNCTION_LABELS,
  LENGTH_POLICY_LABELS,
  OUTPUT_FORMAT_LABELS,
  STANCE_LABELS,
} from "../utils/summarySpecLabels";
import {
  DEFAULT_EXPLICIT_LENGTH,
  DEFAULT_SCALED_LENGTH,
  type LengthSpec,
  type SummarySpecForm,
} from "../utils/useSummarySpecForm";
import { FieldLabel, Input, RangeInput, Select, Textarea } from "./ui/Field";

// Keep in sync with backend/app/schemas/summary_spec.py — the backend owns the defaults.
const MAX_EXTRA_INSTRUCTIONS_CHARS = 2000;

function densityLabel(slider: number): string {
  if (slider < 1 / 3) return "zwięźle";
  if (slider < 2 / 3) return "standard";
  return "obszernie";
}

interface ProcessingStrategySelectProps {
  processingStrategies: Record<string, string>;
  selectedProcessingStrategy: string;
  onProcessingStrategyChange: (strategy: string) => void;
  disabled: boolean;
}

export function ProcessingStrategySelect({
  processingStrategies,
  selectedProcessingStrategy,
  onProcessingStrategyChange,
  disabled,
}: ProcessingStrategySelectProps) {
  const idPrefix = useId();
  return (
    <div className="grid shrink-0 gap-2">
      <FieldLabel htmlFor={`${idPrefix}-strategy`}>Strategia przetwarzania</FieldLabel>
      <Select
        id={`${idPrefix}-strategy`}
        value={selectedProcessingStrategy}
        onChange={(event) => onProcessingStrategyChange(event.target.value)}
        disabled={disabled}
        className="max-w-56 truncate"
      >
        {Object.entries(processingStrategies).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
    </div>
  );
}

interface MatchReferenceCheckboxProps {
  form: SummarySpecForm;
  disabled: boolean;
}

// Placed by the caller in the same row as the other always-editable controls — it decides
// whether the length row below even renders, so it belongs next to what it controls, not on
// its own line.
export function MatchReferenceCheckbox({ form, disabled }: MatchReferenceCheckboxProps) {
  if (!form.offerMatchReference) return null;
  return (
    <label className="flex h-control shrink-0 items-center gap-2 text-muted">
      <input
        type="checkbox"
        checked={form.matchReference}
        onChange={(event) => form.setMatchReference(event.target.checked)}
        disabled={disabled}
        className="h-4 w-4 border border-input-border"
      />
      Wyrównaj długość{" "}
      <span
        className="cursor-help"
        title="Docelowa liczba słów i zdań brana z każdego złotego podsumowania z osobna."
      >
        ⓘ
      </span>
    </label>
  );
}

interface SummarySpecFieldsProps {
  form: SummarySpecForm;
  disabled: boolean;
}

// The fields a preset locks: stance, function, format, length, extra instructions — one flex row
// plus the instructions textarea, never boxed. Which control is disabled is enough to show what a
// preset controls, without a border pretending it's a separate feature.
export function SummarySpecFields({ form, disabled }: SummarySpecFieldsProps) {
  const idPrefix = useId();
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const { spec } = form;
  const lengthMatchesReference = form.offerMatchReference && form.matchReference;

  const setLength = (length: LengthSpec) => form.updateSpec({ length });
  const explicitLength = spec.length?.policy === "explicit" ? spec.length : null;
  const scaledLength = spec.length?.policy === "scaled_to_input" ? spec.length : null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="grid shrink-0 gap-2">
          <FieldLabel htmlFor={fieldId("stance")}>
            Narracja{" "}
            <span
              className="cursor-help text-muted"
              title={
                "Głosem dokumentu: „Lehman Brothers upadł we wrześniu 2008.” " +
                "O dokumencie: „Ten artykuł omawia upadek Lehman Brothers.”"
              }
            >
              ⓘ
            </span>
          </FieldLabel>
          <Select
            id={fieldId("stance")}
            value={spec.narrative_stance}
            onChange={(event) =>
              form.updateSpec({
                narrative_stance: event.target.value as SummarySpec["narrative_stance"],
              })
            }
            disabled={disabled}
            className="max-w-56 truncate"
          >
            {Object.entries(STANCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid shrink-0 gap-2">
          <FieldLabel htmlFor={fieldId("function")}>
            Funkcja{" "}
            <span
              className="cursor-help text-muted"
              title={
                "Informacyjne: podaje fakty i wnioski, zastępuje tekst. " +
                "Wskazujące: sygnalizuje temat bez faktów, np. „Tekst dotyczy...”."
              }
            >
              ⓘ
            </span>
          </FieldLabel>
          <Select
            id={fieldId("function")}
            value={spec.summary_function}
            onChange={(event) =>
              form.updateSpec({
                summary_function: event.target.value as SummarySpec["summary_function"],
              })
            }
            disabled={disabled}
            className="max-w-56 truncate"
          >
            {Object.entries(FUNCTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid shrink-0 gap-2">
          <FieldLabel htmlFor={fieldId("format")}>Format</FieldLabel>
          <Select
            id={fieldId("format")}
            value={spec.output_format}
            onChange={(event) =>
              form.updateSpec({
                output_format: event.target.value as SummarySpec["output_format"],
              })
            }
            disabled={disabled}
            className="max-w-56 truncate"
          >
            {Object.entries(OUTPUT_FORMAT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {lengthMatchesReference ? null : (
          <>
            <div className="grid shrink-0 gap-2">
              <FieldLabel htmlFor={fieldId("length-policy")}>Długość</FieldLabel>
              <Select
                id={fieldId("length-policy")}
                value={spec.length?.policy === "explicit" ? "explicit" : "scaled_to_input"}
                onChange={(event) =>
                  setLength(
                    event.target.value === "explicit"
                      ? DEFAULT_EXPLICIT_LENGTH
                      : DEFAULT_SCALED_LENGTH,
                  )
                }
                disabled={disabled}
                className="max-w-56 truncate"
              >
                {(["scaled_to_input", "explicit"] as const).map((key) => (
                  <option key={key} value={key}>
                    {LENGTH_POLICY_LABELS[key]}
                  </option>
                ))}
              </Select>
            </div>

            {scaledLength ? (
              <div className="grid shrink-0 gap-2">
                <FieldLabel htmlFor={fieldId("density")}>
                  Gęstość — {densityLabel(scaledLength.slider)}
                </FieldLabel>
                <RangeInput
                  id={fieldId("density")}
                  min={0}
                  max={1}
                  step={0.05}
                  value={scaledLength.slider}
                  aria-valuetext={densityLabel(scaledLength.slider)}
                  onChange={(event) =>
                    setLength({ ...scaledLength, slider: Number(event.target.value) })
                  }
                  disabled={disabled}
                />
              </div>
            ) : explicitLength ? (
              <>
                <div className="grid shrink-0 gap-2">
                  <FieldLabel htmlFor={fieldId("target-words")}>Liczba słów</FieldLabel>
                  <Input
                    id={fieldId("target-words")}
                    type="number"
                    min={1}
                    max={3000}
                    className="max-w-24"
                    value={explicitLength.target_words}
                    onChange={(event) =>
                      setLength({
                        ...explicitLength,
                        target_words: Number(event.target.value),
                      })
                    }
                    disabled={disabled}
                  />
                </div>
                <div className="grid shrink-0 gap-2">
                  <FieldLabel htmlFor={fieldId("target-sentences")}>
                    Liczba zdań{" "}
                    <span
                      className="cursor-help text-muted"
                      title="Puste pole — liczba zdań wyliczona automatycznie ze słów."
                    >
                      ⓘ
                    </span>
                  </FieldLabel>
                  <Input
                    id={fieldId("target-sentences")}
                    type="number"
                    min={1}
                    max={50}
                    className="max-w-24"
                    value={explicitLength.target_sentences ?? ""}
                    onChange={(event) =>
                      setLength({
                        ...explicitLength,
                        target_sentences:
                          event.target.value === "" ? null : Number(event.target.value),
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              </>
            ) : null}
          </>
        )}
      </div>

      <div className="grid gap-2">
        <FieldLabel htmlFor={fieldId("extra")}>
          Dodatkowe instrukcje dla modelu (opcjonalnie)
        </FieldLabel>
        <Textarea
          id={fieldId("extra")}
          rows={2}
          value={spec.extra_instructions ?? ""}
          maxLength={MAX_EXTRA_INSTRUCTIONS_CHARS}
          onChange={(event) =>
            form.updateSpec({
              extra_instructions: event.target.value === "" ? null : event.target.value,
            })
          }
          disabled={disabled}
        />
      </div>
    </div>
  );
}
