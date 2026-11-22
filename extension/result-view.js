import { ACTIVE_ENVIRONMENT } from "./config.js";
import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";

function element(tagName, properties = {}, children = []) {
  const created = Object.assign(document.createElement(tagName), properties);
  created.append(...children);
  return created;
}

// A link followed inside the panel would replace the panel itself.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "A") return;
  node.setAttribute("target", "_blank");
  node.setAttribute("rel", "noopener");
});

// The summary is model output, so the HTML marked produces is sanitized before it reaches the page;
// images are dropped because a remote one is fetched as soon as it renders.
function renderMarkdown(markdown) {
  const container = element("div", { className: "markdown" });
  container.innerHTML = DOMPurify.sanitize(marked.parse(markdown), {
    FORBID_TAGS: ["img"],
  });
  return container;
}

function resultPageUrl(entry) {
  const resultUrl = new URL("/", ACTIVE_ENVIRONMENT.appUrl);
  resultUrl.searchParams.set("job", entry.jobId);
  resultUrl.searchParams.set("preset", entry.presetKey);
  return resultUrl.href;
}

function sourceLink(entry) {
  if (entry.sourceUrl === null) {
    return element("span", {
      className: "source",
      textContent: entry.sourceLabel,
    });
  }
  return element("a", {
    className: "source",
    href: entry.sourceUrl,
    target: "_blank",
    rel: "noopener",
    textContent: entry.sourceLabel,
  });
}

const CHANNEL_LABELS = {
  web: "sieć",
  discussions: "Hacker News",
  science: "publikacje",
  factcheck_google: "Google Fact Check",
  factcheck_web: "serwis fact-checkingowy",
};

const STANCE_GROUPS = [
  { stance: "supports", heading: "Potwierdzają" },
  { stance: "contradicts", heading: "Podważają" },
  { stance: "context", heading: "Kontekst" },
];

function reviewNote(review) {
  const reviewedOn =
    review.reviewed_at === null
      ? ""
      : ` (${new Date(review.reviewed_at).toLocaleDateString("pl-PL")})`;
  return [
    element("span", {
      className: "muted",
      textContent: ` · ${review.publisher}: ${review.verdict}${reviewedOn}`,
    }),
    element("span", {
      className: "muted checked-claim",
      textContent: `Sprawdzane twierdzenie: ${review.claim}`,
    }),
  ];
}

function sourceItem(source, number) {
  return element("li", {}, [
    `[${number}] `,
    element("a", {
      href: source.url,
      target: "_blank",
      rel: "noopener",
      textContent: source.title ?? source.url,
    }),
    element("span", {
      className: "muted",
      textContent: ` · ${CHANNEL_LABELS[source.channel]}`,
    }),
    ...(source.review === null ? [] : reviewNote(source.review)),
  ]);
}

// Grouped by stance, each source keeps the [n] the assessment text cites it by.
function sourcesByStance(sources) {
  const numbered = sources.map((source, index) => ({
    source,
    number: index + 1,
  }));
  return STANCE_GROUPS.flatMap(({ stance, heading }) => {
    const inGroup = numbered.filter(({ source }) => source.stance === stance);
    if (inGroup.length === 0) return [];
    return [
      element("h4", { textContent: heading }),
      element(
        "ul",
        {},
        inGroup.map(({ source, number }) => sourceItem(source, number)),
      ),
    ];
  });
}

function checkFactsButton(label, onClick) {
  const button = element("button", { type: "button", textContent: label });
  button.addEventListener("click", () => {
    button.disabled = true;
    onClick();
  });
  return button;
}

function factCheckBody(factCheck, onCheckFacts) {
  if (factCheck === null) return [checkFactsButton("Sprawdź fakty", onCheckFacts)];
  switch (factCheck.status) {
    case "working":
      return [
        element("p", {
          className: "muted",
          textContent: "Sprawdzam fakty w innych źródłach...",
        }),
        element("progress", { ariaLabel: "Sprawdzanie faktów" }),
      ];
    case "failed":
      return [
        element("p", {
          className: "error",
          textContent: factCheck.error,
        }),
        checkFactsButton("Spróbuj ponownie", onCheckFacts),
      ];
    case "completed":
      return [renderMarkdown(factCheck.text), ...sourcesByStance(factCheck.sources)];
    default:
      throw new Error(`unknown fact check status "${factCheck.status}"`);
  }
}

function factCheckSection(factCheck, onCheckFacts) {
  return element("section", { className: "fact-check" }, [
    element("h3", { textContent: "Weryfikacja faktów" }),
    ...factCheckBody(factCheck, onCheckFacts),
  ]);
}

function completedEntry(entry, onCheckFacts) {
  // entries saved before the fact check have no factCheck field
  const factCheck = entry.factCheck ?? null;
  return [
    element("h2", {}, [
      element("a", {
        href: resultPageUrl(entry),
        target: "_blank",
        rel: "noopener",
        title: "Otwórz na stronie",
        textContent: entry.title,
      }),
    ]),
    sourceLink(entry),
    renderMarkdown(entry.summary),
    factCheckSection(factCheck, () => onCheckFacts(entry)),
  ];
}

function entryContent(entry, onCheckFacts) {
  if (entry === null) {
    return [
      element("p", {
        className: "muted",
        textContent: "Tu pojawi się podsumowanie.",
      }),
    ];
  }
  switch (entry.status) {
    case "pending":
    case "running":
      return [
        element("p", {
          className: "muted",
          textContent: "Przygotowuję podsumowanie...",
        }),
        element("progress", { ariaLabel: "Przygotowywanie podsumowania" }),
        sourceLink(entry),
      ];
    case "failed":
      return [element("p", { className: "error", textContent: entry.error }), sourceLink(entry)];
    case "completed":
      return completedEntry(entry, onCheckFacts);
    default:
      throw new Error(`unknown history entry status "${entry.status}"`);
  }
}

/**
 * Pending and running entries show a placeholder, failed ones their error, completed ones title,
 * markdown and the fact check; onCheckFacts(entry) runs when the reader asks for one.
 */
export function renderCurrentEntry(container, entry, { onCheckFacts }) {
  container.replaceChildren(...entryContent(entry, onCheckFacts));
}

const STATUS_LABELS = {
  pending: "w kolejce",
  running: "w trakcie",
  completed: "gotowe",
  failed: "błąd",
};

function historyItem(entry, isCurrent, onSelect) {
  const button = element("button", { type: "button", className: "history-item" }, [
    element("span", {
      className: "history-title",
      textContent: entry.title ?? entry.sourceLabel,
    }),
    element("span", {
      className: "muted",
      textContent: `${STATUS_LABELS[entry.status]} · ${new Date(entry.createdAt).toLocaleString("pl-PL")}`,
    }),
  ]);
  if (isCurrent) button.setAttribute("aria-current", "true");
  button.addEventListener("click", () => onSelect(entry.jobId));
  return element("li", {}, [button]);
}

/** Newest first; clicking an entry calls onSelect with its jobId. */
export function renderHistoryList(container, entries, { currentJobId, onSelect }) {
  if (entries.length === 0) {
    container.replaceChildren(
      element("p", { className: "muted", textContent: "Historia jest pusta." }),
    );
    return;
  }
  container.replaceChildren(
    element(
      "ul",
      { className: "history-list" },
      entries.map((entry) => historyItem(entry, entry.jobId === currentJobId, onSelect)),
    ),
  );
}
