import { ACTIVE_ENVIRONMENT } from "./config.js";
import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";

const COPIED_LABEL_MS = 1500;

function element(tagName, properties = {}, children = []) {
  const created = Object.assign(document.createElement(tagName), properties);
  created.append(...children);
  return created;
}

// The summary is model output, so the HTML marked produces is sanitized before it reaches the page.
function renderMarkdown(markdown) {
  const container = element("div", { className: "markdown" });
  container.innerHTML = DOMPurify.sanitize(marked.parse(markdown));
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

function completedEntry(entry) {
  return [
    element("h2", { textContent: entry.title }),
    sourceLink(entry),
    renderMarkdown(entry.summary),
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
