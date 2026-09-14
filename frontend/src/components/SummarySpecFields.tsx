import { useId } from "react";
import type { SummaryPresetOut, SummarySpec } from "../types/api.generated";
import {
  FUNCTION_LABELS,
  formatLengthTarget,
  LENGTH_POLICY_LABELS,
  OUTPUT_FORMAT_LABELS,
  STANCE_LABELS,
} from "../utils/summarySpecLabels";
import {
  CUSTOM_PRESET_KEY,
  DEFAULT_EXPLICIT_LENGTH,
  DEFAULT_SCALED_LENGTH,
  type LengthSpec,
  type SummarySpecForm,
} from "../utils/useSummarySpecForm";
import { DisclosureButton } from "./ui/DisclosureButton";
import { FieldLabel, Input, RangeInput, Select, Textarea } from "./ui/Field";

// Keep in sync with backend/app/schemas/summary_spec.py — the backend owns the defaults.
const MAX_FOCUS_QUERY_CHARS = 300;
const MAX_EXTRA_INSTRUCTIONS_CHARS = 2000;

function densityLabel(slider: number): string {
  if (slider < 1 / 3) return "zwięźle";
  if (slider < 2 / 3) return "standard";
  return "obszernie";
}

function describeLength(length: LengthSpec): string {
  if (length.policy === "scaled_to_input") {
    return `gęstość: ${densityLabel(length.slider)} (${Math.round(length.slider * 100)}%)`;
  }
  if (length.policy === "explicit") {
    return `~${formatLengthTarget(length.target_words ?? 0, length.target_sentences)}`;
  }
  return "dopasowana do wzorca";
}

interface SummarySpecFieldsProps {
  form: SummarySpecForm;
  presets: Record<string, SummaryPresetOut>;
  processingStrategies: Record<string, string>;
  selectedProcessingStrategy: string;
  onProcessingStrategyChange: (strategy: string) => void;
  disabled: boolean;
}

export function SummarySpecFields({
  form,
  presets,
  processingStrategies,
  selectedProcessingStrategy,
  onProcessingStrategyChange,
  disabled,
}: SummarySpecFieldsProps) {
  const idPrefix = useId();
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const { spec } = form;
  const specFieldsDisabled = disabled || form.isLocked || !spec;
  const lengthMatchesReference = form.offerMatchReference && form.matchReference;

  const setLength = (length: LengthSpec) => form.updateSpec({ length });

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel htmlFor={fieldId("preset")}>Rodzaj podsumowania</FieldLabel>
          <Select
            id={fieldId("preset")}
            value={form.presetKey}
            onChange={(event) => form.selectPreset(event.target.value)}
            disabled={disabled}
          >
            {Object.entries(presets).map(([key, preset]) => (
              <option key={key} value={key}>
                {preset.label}
              </option>
            ))}
            <option value={CUSTOM_PRESET_KEY}>Własne ustawienia</option>
          </Select>
        </div>

        <div className="grid gap-2">
          {spec?.length?.policy === "scaled_to_input" && !lengthMatchesReference ? (
            <>
              <FieldLabel htmlFor={fieldId("density")}>
                Długość — {describeLength(spec.length)}
              </FieldLabel>
              <RangeInput
                id={fieldId("density")}
                min={0}
                max={1}
                step={0.05}
                value={spec.length.slider}
                aria-valuetext={densityLabel(spec.length.slider)}
                onChange={(event) =>
                  setLength({ policy: "scaled_to_input", slider: Number(event.target.value) })
                }
                disabled={specFieldsDisabled}
              />
            </>
          ) : (
            <>
              <span className="block font-semibold text-muted">Długość</span>
              <span className="flex h-control items-center text-ink">
                {lengthMatchesReference
                  ? "dopasowana do wzorca"
                  : spec?.length
                    ? describeLength(spec.length)
                    : "ładowanie…"}
              </span>
            </>
          )}
        </div>
      </div>

      {form.offerMatchReference ? (
        <label className="flex items-center gap-2 text-muted">
          <input
            type="checkbox"
            checked={form.matchReference}
            onChange={(event) => form.setMatchReference(event.target.checked)}
            disabled={disabled}
            className="h-4 w-4 border border-input-border"
          />
          Wyrównaj długość do wzorca (liczba słów i zdań z każdego złotego podsumowania)
        </label>
      ) : null}

      <div className="grid gap-4">
        <div className="justify-self-start">
          <DisclosureButton
            label="Zaawansowane"
            isOpen={form.isAdvancedOpen}
            onToggle={form.toggleAdvanced}
          />
        </div>

        {form.isAdvancedOpen && spec ? (
          <div className="grid gap-4 border border-panel-border p-4">
            {form.isLocked ? (
              <p className="text-muted">
                Wybierz „Własne ustawienia”, żeby zmienić pola poniżej — teraz pokazują wartości
                presetu.
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor={fieldId("strategy")}>Strategia przetwarzania</FieldLabel>
                <Select
                  id={fieldId("strategy")}
                  value={selectedProcessingStrategy}
                  onChange={(event) => onProcessingStrategyChange(event.target.value)}
                  disabled={disabled}
                >
                  {Object.entries(processingStrategies).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-2">
                <FieldLabel htmlFor={fieldId("stance")}>Narracja</FieldLabel>
                <Select
                  id={fieldId("stance")}
                  value={spec.narrative_stance}
                  onChange={(event) =>
                    form.updateSpec({
                      narrative_stance: event.target.value as SummarySpec["narrative_stance"],
                    })
                  }
                  disabled={specFieldsDisabled}
                >
                  {Object.entries(STANCE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-2">
                <FieldLabel htmlFor={fieldId("function")}>Funkcja</FieldLabel>
                <Select
                  id={fieldId("function")}
                  value={spec.summary_function}
                  onChange={(event) =>
                    form.updateSpec({
                      summary_function: event.target.value as SummarySpec["summary_function"],
                    })
                  }
                  disabled={specFieldsDisabled}
                >
                  {Object.entries(FUNCTION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-2">
                <FieldLabel htmlFor={fieldId("format")}>Format wyniku</FieldLabel>
                <Select
                  id={fieldId("format")}
                  value={spec.output_format}
                  onChange={(event) =>
                    form.updateSpec({
                      output_format: event.target.value as SummarySpec["output_format"],
                    })
                  }
                  disabled={specFieldsDisabled}
                >
                  {Object.entries(OUTPUT_FORMAT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {lengthMatchesReference ? null : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2">
                  <FieldLabel htmlFor={fieldId("length-policy")}>
                    Sposób ustalania długości
                  </FieldLabel>
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
                    disabled={specFieldsDisabled}
                  >
                    {(["scaled_to_input", "explicit"] as const).map((key) => (
                      <option key={key} value={key}>
                        {LENGTH_POLICY_LABELS[key]}
                      </option>
                    ))}
                  </Select>
                </div>

                {spec.length?.policy === "explicit" ? (
                  <>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={fieldId("target-words")}>
                        Docelowa liczba słów
                      </FieldLabel>
                      <Input
                        id={fieldId("target-words")}
                        type="number"
                        min={1}
                        max={3000}
                        value={spec.length.target_words ?? ""}
                        onChange={(event) =>
                          setLength({
                            ...spec.length,
                            policy: "explicit",
                            target_words:
                              event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                        disabled={specFieldsDisabled}
                      />
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={fieldId("target-sentences")}>
                        Liczba zdań (puste = wyliczona ze słów)
                      </FieldLabel>
                      <Input
                        id={fieldId("target-sentences")}
                        type="number"
                        min={1}
                        max={50}
                        value={spec.length.target_sentences ?? ""}
                        onChange={(event) =>
                          setLength({
                            ...spec.length,
                            policy: "explicit",
                            target_sentences:
                              event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                        disabled={specFieldsDisabled}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            )}

            <div className="grid gap-2">
              <FieldLabel htmlFor={fieldId("focus")}>Na czym się skupić (opcjonalnie)</FieldLabel>
              <Input
                id={fieldId("focus")}
                value={spec.focus_query ?? ""}
                maxLength={MAX_FOCUS_QUERY_CHARS}
                onChange={(event) =>
                  form.updateSpec({
                    focus_query: event.target.value === "" ? null : event.target.value,
                  })
                }
                disabled={specFieldsDisabled}
              />
            </div>

            <div className="grid gap-2">
              <FieldLabel htmlFor={fieldId("extra")}>
                Dodatkowe instrukcje dla modelu (opcjonalnie)
              </FieldLabel>
              <Textarea
                id={fieldId("extra")}
                rows={3}
                value={spec.extra_instructions ?? ""}
                maxLength={MAX_EXTRA_INSTRUCTIONS_CHARS}
                onChange={(event) =>
                  form.updateSpec({
                    extra_instructions: event.target.value === "" ? null : event.target.value,
                  })
                }
                disabled={specFieldsDisabled}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
