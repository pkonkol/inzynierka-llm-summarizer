import { MAX_PASTED_CHARS } from "../utils/utils";
import { FieldLabel, Input, Textarea } from "./ui/Field";

export type SourceMode = "url" | "pastedText";

// A bare http(s) address with no whitespace is treated as a URL to scrape; anything else typed
// or pasted in is the article text itself. Detection happens on every keystroke, so it must stay
// this cheap — no URL parsing, just the shape a real pasted article never has.
export function detectSourceMode(content: string): SourceMode {
  const trimmed = content.trim();
  return /^https?:\/\/\S+$/.test(trimmed) ? "url" : "pastedText";
}

interface SourceFieldProps {
  content: string;
  onContentChange: (content: string) => void;
  pastedTitle: string;
  onPastedTitleChange: (title: string) => void;
  disabled: boolean;
}

// One field instead of a URL/pasted-text tab switch: paste a link and it's scraped, paste an
// article and it's summarized directly. A title is asked for only once there is text to name.
export function SourceField({
  content,
  onContentChange,
  pastedTitle,
  onPastedTitleChange,
  disabled,
}: SourceFieldProps) {
  const mode = detectSourceMode(content);
  const isPastedText = mode === "pastedText" && content.trim().length > 0;

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <FieldLabel htmlFor="source-content">Adres artykułu albo jego treść</FieldLabel>
          {isPastedText ? (
            <span className="text-xs text-muted">
              {content.length.toLocaleString("pl-PL")} / {MAX_PASTED_CHARS.toLocaleString("pl-PL")}
            </span>
          ) : null}
        </div>
        <Textarea
          id="source-content"
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="https://example.com/artykul albo wklejony tekst artykułu..."
          disabled={disabled}
          required
          rows={isPastedText ? 8 : 1}
          maxLength={MAX_PASTED_CHARS}
        />
      </div>
      {isPastedText ? (
        <div className="grid gap-2">
          <FieldLabel htmlFor="pasted-title">Tytuł</FieldLabel>
          <Input
            id="pasted-title"
            value={pastedTitle}
            onChange={(e) => onPastedTitleChange(e.target.value)}
            placeholder="Tytuł, pod którym wynik pojawi się na liście"
            disabled={disabled}
            required
          />
        </div>
      ) : null}
    </div>
  );
}
