import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DisclosureButton } from "./DisclosureButton";

export interface DisclosureSection {
  key: string;
  label: string;
  content: React.ReactNode;
}

// The detail panel scrolls inside its own aside, the research pages scroll the document. An
// ancestor can report overflow-y: auto without ever scrolling, so the height check is what
// makes this return the box that actually moves.
function findScroller(node: HTMLElement): Element | null {
  for (
    let element = node.parentElement;
    element && element !== document.body;
    element = element.parentElement
  ) {
    const { overflowY } = getComputedStyle(element);
    const canScroll = overflowY === "auto" || overflowY === "scroll";
    if (canScroll && element.scrollHeight > element.clientHeight) return element;
  }
  return document.scrollingElement;
}

// A row of toggles with one section open at a time. Content is a React element, so a section
// that fetches on mount does not fetch until it is opened. `trailing` shares the toggle row,
// for an action that belongs beside the sections.
export function DisclosureSections({
  sections,
  trailing,
}: {
  sections: DisclosureSection[];
  trailing?: React.ReactNode;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggleRowRef = useRef<HTMLDivElement>(null);
  const open = sections.find((section) => section.key === openKey);

  function closeSection() {
    const row = toggleRowRef.current;
    const scroller = row && findScroller(row);
    if (!row || !scroller) {
      setOpenKey(null);
      return;
    }

    // The removed region starts at the toggle row's bottom edge: first the grid gap, then the box.
    const viewportTop =
      scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
    const removedRegionTop = row.getBoundingClientRect().bottom - viewportTop;
    const scrollTopBefore = scroller.scrollTop;
    const scrollHeightBefore = scroller.scrollHeight;

    flushSync(() => setOpenKey(null));

    // With the toggle row still on screen nothing above the reader changed, so the page simply
    // shortens downwards. Once they have scrolled past it the full height comes back, which is
    // what keeps the next entry on its pixel. Giving back only the part that was above the
    // viewport would instead park that entry at the top of the screen.
    // scrollHeight rather than the box's own height, so the grid gap it takes with it counts.
    const removed = scrollHeightBefore - scroller.scrollHeight;
    const hasScrolledPastToggleRow = removedRegionTop < 0;
    scroller.scrollTop = scrollTopBefore - (hasScrolledPastToggleRow ? removed : 0);
  }

  return (
    <>
      <div ref={toggleRowRef} className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <DisclosureButton
            key={section.key}
            label={section.label}
            isOpen={section.key === openKey}
            onToggle={() => (section.key === openKey ? closeSection() : setOpenKey(section.key))}
          />
        ))}
        {trailing}
      </div>

      {open ? (
        <div className="min-w-0 border border-panel-border">
          {open.content}
          <button
            type="button"
            onClick={closeSection}
            aria-label={`Zwiń: ${open.label}`}
            className="flex w-full cursor-pointer items-center justify-center border-t border-panel-border bg-subtle-hover py-1 text-xs text-muted transition-colors hover:bg-subtle"
          >
            <span aria-hidden="true">▲</span>
          </button>
        </div>
      ) : null}
    </>
  );
}
