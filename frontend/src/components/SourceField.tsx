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
  // Borderless and stretched over the height the parent gives it: the composer frame around it is the field.
  inComposer?: boolean;
}

// One field instead of a URL/pasted-text tab switch: paste a link and it's scraped, paste an
// article and it's summarized directly.
export function SourceField({
  content,
  onContentChange,
  maxLength,
  disabled,
  inComposer = false,
}: SourceFieldProps) {
  const isPastedText = detectSourceMode(content) === "pastedText" && content.trim().length > 0;

  const textareaProps = {
    id: "source-content",
    value: content,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
      onContentChange(event.target.value),
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    },
    placeholder: "https://example.com/artykul albo wklejony tekst artykułu...",
    disabled,
    required: true,
    maxLength,
  };

  return (
    <div className={cn("grid gap-2", inComposer && "flex-1 grid-rows-[auto_1fr] gap-0")}>
      <div className={cn("flex items-baseline justify-between gap-2", inComposer && "px-4 pt-3")}>
        <FieldLabel htmlFor="source-content">Adres artykułu albo jego treść</FieldLabel>
        {isPastedText ? (
          <span className="text-caption text-mute">
            {content.length.toLocaleString("pl-PL")} / {maxLength.toLocaleString("pl-PL")}
          </span>
        ) : null}
      </div>
      {inComposer ? (
        // The composer's focus-within border and background are this field's focus indicator.
        <textarea
          {...textareaProps}
          className="min-h-24 w-full resize-none bg-transparent px-4 py-2 font-reading text-reading text-ink outline-none disabled:cursor-not-allowed disabled:text-ash"
        />
      ) : (
        <Textarea {...textareaProps} rows={8} />
      )}
    </div>
  );
}
