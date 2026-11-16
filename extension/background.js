import { startLinkSummaryJob } from "./summary-request.js";

const SUMMARIZE_LINK_MENU_ID = "summarize-link";

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
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SUMMARIZE_LINK_MENU_ID) return;
  // A link inside the panel itself comes without a tab, and the panel is already open then.
  // Chrome accepts open() only while the click still counts as a user gesture, which any await before it ends.
  if (tab !== undefined) chrome.sidePanel.open({ windowId: tab.windowId });
  startLinkSummaryJob(info.linkUrl);
});
