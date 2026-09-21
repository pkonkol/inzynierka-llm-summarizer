import { MAX_PASTED_CHARS } from "../utils/utils";
import { FieldLabel, Textarea } from "./ui/Field";

export type SourceMode = "url" | "pastedText";

// A bare http(s) address with no whitespace is treated as a URL to scrape; anything else typed
// or pasted in is the article text itself. Detection happens on every keystroke, so it must stay
// this cheap — no URL parsing, just the shape a real pasted article never has.
export function detectSourceMode(content: string): SourceMode {
  const trimmed = content.trim();
  return /^https?:\/\/\S*[^\s.,;:!?)]$/.test(trimmed) ? "url" : "pastedText";
}

interface SourceFieldProps {
  content: string;
  onContentChange: (content: string) => void;
  disabled: boolean;
}

// One field instead of a URL/pasted-text tab switch: paste a link and it's scraped, paste an
// article and it's summarized directly.
export function SourceField({ content, onContentChange, disabled }: SourceFieldProps) {
  const isPastedText = detectSourceMode(content) === "pastedText" && content.trim().length > 0;

  return (
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
        rows={8}
        maxLength={MAX_PASTED_CHARS}
      />
    </div>
  );
}
