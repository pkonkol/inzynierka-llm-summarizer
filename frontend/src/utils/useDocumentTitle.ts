import { useEffect } from "react";

const TITLE_SUFFIX = "Praca inżynierska";

// The page-specific part goes first: browser tabs truncate from the right, so what tells two
// tabs apart has to be on the left. `null` means the data has not arrived yet.
export function useDocumentTitle(pageTitle: string | null) {
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} — ${TITLE_SUFFIX}` : TITLE_SUFFIX;
  }, [pageTitle]);
}
