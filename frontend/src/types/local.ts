// Shapes the backend uses but does not expose as named OpenAPI schemas: FastAPI inlines
// Literal enums and tuples. Derived from the generated types so they cannot drift.

import type { JobStatusResponse } from "./api.generated";

export type JobStatusValue = JobStatusResponse["status"];

/** Backend emits [role, template] pairs, not objects. */
export type PromptMessage = JobStatusResponse["prompt_template"][number];
