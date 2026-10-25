// Runs inside the page, where vendor/Readability.js has already defined the global `Readability`.
// Readability rewrites the DOM it parses, so it gets a copy and the visible page stays intact.
// textContent of the whole article runs blocks together on minified pages ("First.Second."),
// so the text is collected block by block and joined with blank lines.
function extractArticleText() {
  const article = new Readability(document.cloneNode(true)).parse();
  if (article === null) return "";

  const articleBody = new DOMParser().parseFromString(article.content, "text/html").body;
  const blocks = articleBody.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre");
  const blockTexts = [...blocks]
    .filter((block) => block.querySelector("p, li, blockquote, pre") === null)
    .map((block) => block.textContent.trim())
    .filter((text) => text.length > 0);
  // An article Readability kept as bare text, with no block elements at all.
  if (blockTexts.length === 0) return article.textContent.trim();
  return blockTexts.join("\n\n");
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
