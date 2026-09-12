import { MAX_PASTED_CHARS } from "../utils/utils";
import { FieldLabel, Input, Textarea } from "./ui/Field";

interface PastedTextSourceFieldsProps {
  title: string;
  onTitleChange: (title: string) => void;
  text: string;
  onTextChange: (text: string) => void;
  disabled: boolean;
}

export function PastedTextSourceFields({
  title,
  onTitleChange,
  text,
  onTextChange,
  disabled,
}: PastedTextSourceFieldsProps) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <FieldLabel htmlFor="pasted-title">Tytuł</FieldLabel>
        <Input
          id="pasted-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Tytuł, pod którym wynik pojawi się na liście"
          disabled={disabled}
          required
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <FieldLabel htmlFor="pasted-text">Treść do podsumowania</FieldLabel>
          <span className="text-xs text-muted">
            {text.length.toLocaleString("pl-PL")} / {MAX_PASTED_CHARS.toLocaleString("pl-PL")}
          </span>
        </div>
        <Textarea
          id="pasted-text"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Wklej tekst artykułu..."
          disabled={disabled}
          required
          rows={8}
          maxLength={MAX_PASTED_CHARS}
        />
      </div>
    </div>
  );
}
