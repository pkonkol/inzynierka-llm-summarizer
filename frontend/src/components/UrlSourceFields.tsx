import { FieldLabel, Input } from "./ui/Field";

interface UrlSourceFieldsProps {
  url: string;
  onUrlChange: (url: string) => void;
  disabled: boolean;
}

export function UrlSourceFields({ url, onUrlChange, disabled }: UrlSourceFieldsProps) {
  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor="article-url">Adres do analizy</FieldLabel>
      <Input
        id="article-url"
        type="url"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://example.com/artykul"
        disabled={disabled}
        required
      />
    </div>
  );
}
