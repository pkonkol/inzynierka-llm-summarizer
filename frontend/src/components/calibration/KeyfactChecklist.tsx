import type { ReactNode } from "react";

type KeyfactChecklistProps = {
  keyfacts: string[];
  isApproved: boolean;
  presence: (boolean | null)[];
  onApprove: (keyfacts: string[]) => void;
  onPresenceChange: (presence: (boolean | null)[]) => void;
};

/** Key facts of the source: edited and approved once per source, then ticked as present or missing per summary. */
export function KeyfactChecklist(_props: KeyfactChecklistProps): ReactNode {
  throw new Error("not implemented");
}
