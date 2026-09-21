import type { JobCreateRequest } from "../types/api.generated";
import { cn } from "./ui/cn";
import { FieldLabel, Textarea } from "./ui/Field";

export type SourceMode = "url" | "pastedText";

// A bare http(s) address with no whitespace is treated as a URL to scrape; anything else typed
// or pasted in is the article text itself. Detection happens on every keystroke, so it must stay
// this cheap — no URL parsing, just the shape a real pasted article never has.
export function detectSourceMode(content: string): SourceMode {
  const trimmed = content.trim();
  return /^https?:\/\/\S*[^\s.,;:!?)]$/.test(trimmed) ? "url" : "pastedText";
}

export type SourcePayload = Pick<JobCreateRequest, "url" | "input_text">;

export function buildSourcePayload(content: string): {
  payload: SourcePayload | null;
  error: string | null;
} {
  if (detectSourceMode(content) === "url") {
    try {
      const parsed = new URL(content.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { payload: null, error: "Adres musi zaczynać się od http:// lub https://" };
      }
    } catch {
      return { payload: null, error: "Wprowadź poprawny adres URL artykułu" };
    }
    return { payload: { url: content.trim() }, error: null };
  }

  if (!content.trim())
    return { payload: null, error: "Podaj adres artykułu albo wklej jego treść" };
  return { payload: { input_text: content }, error: null };
}

interface SourceFieldProps {
  content: string;
  onContentChange: (content: string) => void;
  maxLength: number;
  disabled: boolean;
  // Stretch the text field over the height the parent gives it, instead of a fixed row count.
  fillHeight?: boolean;
}

// One field instead of a URL/pasted-text tab switch: paste a link and it's scraped, paste an
// article and it's summarized directly.
export function SourceField({
  content,
  onContentChange,
  maxLength,
  disabled,
  fillHeight = false,
}: SourceFieldProps) {
  const isPastedText = detectSourceMode(content) === "pastedText" && content.trim().length > 0;

  return (
    <div className={cn("grid gap-2", fillHeight && "h-full grid-rows-[auto_1fr]")}>
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor="source-content">Adres artykułu albo jego treść</FieldLabel>
        {isPastedText ? (
          <span className="text-xs text-muted">
            {content.length.toLocaleString("pl-PL")} / {maxLength.toLocaleString("pl-PL")}
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
        className={cn(fillHeight && "h-full min-h-64 resize-none")}
        maxLength={maxLength}
      />
    </div>
  );
}
