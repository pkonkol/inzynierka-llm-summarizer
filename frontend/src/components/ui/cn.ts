export function cn(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
