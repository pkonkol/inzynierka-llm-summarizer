// Runs inside the page, where vendor/Readability.js has already defined the global `Readability`.
// Readability rewrites the DOM it parses, so it gets a copy and the visible page stays intact.
function extractArticleText() {
  const article = new Readability(document.cloneNode(true)).parse();
  return article?.textContent.trim() ?? "";
}

/** Main article text of the tab, extracted by Readability inside the page; throws when nothing readable is found. */
export async function readArticleText(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["vendor/Readability.js"] });
  const [{ result: articleText }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractArticleText,
  });
  if (!articleText) throw new Error("nie znaleziono na tej stronie treści artykułu");
  return articleText;
}
