import { startLinkSummaryJob, startSelectionSummaryJob } from "./summary-request.js";

const SUMMARIZE_LINK_MENU_ID = "summarize-link";
const SUMMARIZE_SELECTION_MENU_ID = "summarize-selection";

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  // Menu items survive a browser update, which fires onInstalled again with the same id.
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: SUMMARIZE_LINK_MENU_ID,
    title: "Podsumuj link",
    contexts: ["link"],
    targetUrlPatterns: ["http://*/*", "https://*/*"],
  });
  chrome.contextMenus.create({
    id: SUMMARIZE_SELECTION_MENU_ID,
    title: "Podsumuj zaznaczenie",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const isOurMenu =
    info.menuItemId === SUMMARIZE_LINK_MENU_ID || info.menuItemId === SUMMARIZE_SELECTION_MENU_ID;
  if (!isOurMenu) return;
  // A click inside the panel itself comes without a tab, and the panel is already open then.
  // Chrome accepts open() only while the click still counts as a user gesture, which any await before it ends.
  if (tab !== undefined) chrome.sidePanel.open({ windowId: tab.windowId });
  if (info.menuItemId === SUMMARIZE_LINK_MENU_ID) {
    startLinkSummaryJob(info.linkUrl);
  } else {
    startSelectionSummaryJob(info.selectionText, info.pageUrl, tab?.title);
  }
});
