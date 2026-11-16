import { ACTIVE_ENVIRONMENT } from "./config.js";
import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";

const COPIED_LABEL_MS = 1500;

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
  container.innerHTML = DOMPurify.sanitize(marked.parse(markdown), { FORBID_TAGS: ["img"] });
  return container;
}

function resultPageUrl(entry) {
  const resultUrl = new URL("/", ACTIVE_ENVIRONMENT.appUrl);
  resultUrl.searchParams.set("job", entry.jobId);
  resultUrl.searchParams.set("preset", entry.presetKey);
  return resultUrl.href;
}

function copyButton(text) {
  const button = element("button", { type: "button", textContent: "Kopiuj" });
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Skopiowano";
    } catch (error) {
      button.textContent = `Nie udało się skopiować: ${error.message}`;
    }
    setTimeout(() => {
      button.textContent = "Kopiuj";
    }, COPIED_LABEL_MS);
  });
  return button;
}

function sourceLink(entry) {
  return element("a", {
    className: "source",
    href: entry.sourceUrl,
    target: "_blank",
    rel: "noopener",
    textContent: entry.sourceLabel,
  });
}

function factCheckBody(factCheck) {
  switch (factCheck.status) {
    case "working":
      return [
        element("p", { className: "muted", textContent: "Sprawdzam fakty w innych źródłach..." }),
      ];
    case "failed":
      return [
        element("p", {
          className: "error",
          textContent: factCheck.error,
        }),
      ];
    case "completed":
      return [
        renderMarkdown(factCheck.text),
        element(
          "ol",
          {},
          factCheck.sources.map((source, index) =>
            element("li", {}, [
              `[${index + 1}] `,
              element("a", {
                href: source.url,
                target: "_blank",
                rel: "noopener",
                textContent: source.title ?? source.url,
              }),
            ]),
          ),
        ),
      ];
    default:
      throw new Error(`unknown fact check status "${factCheck.status}"`);
  }
}

function factCheckSection(factCheck) {
  return element("section", { className: "fact-check" }, [
    element("h3", { textContent: "Weryfikacja faktów" }),
    ...factCheckBody(factCheck),
  ]);
}

function completedEntry(entry) {
  // entries saved before the fact check have no factCheck field
  const factCheck = entry.factCheck ?? null;
  return [
    element("h2", { textContent: entry.title }),
    sourceLink(entry),
    renderMarkdown(entry.summary),
    ...(factCheck === null ? [] : [factCheckSection(factCheck)]),
    element("div", { className: "actions" }, [
      element("a", {
        className: "button",
        href: resultPageUrl(entry),
        target: "_blank",
        rel: "noopener",
        textContent: "Otwórz na stronie",
      }),
      copyButton(entry.summary),
    ]),
  ];
}

function entryContent(entry) {
  if (entry === null) {
    return [element("p", { className: "muted", textContent: "Tu pojawi się podsumowanie." })];
  }
  switch (entry.status) {
    case "pending":
    case "running":
      return [
        element("p", { className: "muted", textContent: "Przygotowuję podsumowanie..." }),
        sourceLink(entry),
      ];
    case "failed":
      return [element("p", { className: "error", textContent: entry.error }), sourceLink(entry)];
    case "completed":
      return completedEntry(entry);
    default:
      throw new Error(`unknown history entry status "${entry.status}"`);
  }
}

/** Pending and running entries show a placeholder, failed ones their error, completed ones title and markdown. */
export function renderCurrentEntry(container, entry) {
  container.replaceChildren(...entryContent(entry));
}

const STATUS_LABELS = {
  pending: "w kolejce",
  running: "w trakcie",
  completed: "gotowe",
  failed: "błąd",
};

function historyItem(entry, isCurrent, onSelect) {
  const button = element("button", { type: "button", className: "history-item" }, [
    element("span", { className: "history-title", textContent: entry.title ?? entry.sourceLabel }),
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
