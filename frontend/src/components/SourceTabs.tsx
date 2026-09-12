import { SEGMENTED_STRIP_INLINE, segmentedCellClasses } from "./ui/segmentedCell";
import { Tooltip } from "./ui/Tooltip";

export type SourceMode = "url" | "pastedText";

interface SourceTab {
  mode: SourceMode;
  label: string;
  description: string;
}

const TABS: SourceTab[] = [
  {
    mode: "url",
    label: "Adres do analizy",
    description: "Podajesz adres, system pobiera treść strony trafilaturą.",
  },
  {
    mode: "pastedText",
    label: "Tekst do analizy",
    description: "Wklejasz gotowy tekst; tytuł nadajesz sam, bo nie ma skąd go wziąć.",
  },
];

/** The tab's own id, so the panel it controls can point back with aria-labelledby. */
export function sourceTabId(panelId: string, mode: SourceMode): string {
  return `${panelId}-tab-${mode}`;
}

interface SourceTabsProps {
  activeMode: SourceMode;
  onChange: (mode: SourceMode) => void;
  panelId: string;
}

// Switches which fields the form shows below it (URL vs. pasted title + text). Same construction
// as NavDock's segmented strip, reusing its shared cell builder — a later style swap is one file.
export function SourceTabs({ activeMode, onChange, panelId }: SourceTabsProps) {
  return (
    // justify-self-start: the parent is a grid, whose items stretch to the column width by
    // default — without this the strip's own border/background would fill the row.
    <div
      role="tablist"
      aria-label="Źródło treści"
      className={`justify-self-start ${SEGMENTED_STRIP_INLINE}`}
    >
      {TABS.map((tab) => {
        const isActive = tab.mode === activeMode;
        const tabId = sourceTabId(panelId, tab.mode);
        return (
          <Tooltip key={tab.mode} description={tab.description}>
            {(describedBy) => (
              <button
                type="button"
                id={tabId}
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                aria-describedby={describedBy}
                onClick={() => onChange(tab.mode)}
                className={segmentedCellClasses(isActive, "cursor-pointer text-xs tracking-wider")}
              >
                {tab.label}
              </button>
            )}
          </Tooltip>
        );
      })}
    </div>
  );
}
