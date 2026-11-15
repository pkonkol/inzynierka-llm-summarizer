const SUMMARIZE_LINK_MENU_ID = "summarize-link";

chrome.runtime.onInstalled.addListener(() => {
  throw new Error("not implemented");
});

chrome.contextMenus.onClicked.addListener((_info, _tab) => {
  throw new Error("not implemented");
});
