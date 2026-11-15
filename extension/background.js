import { startLinkSummaryJob } from "./summary-request.js";

const SUMMARIZE_LINK_MENU_ID = "summarize-link";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({
    id: SUMMARIZE_LINK_MENU_ID,
    title: "Podsumuj link",
    contexts: ["link"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SUMMARIZE_LINK_MENU_ID) return;
  // Chrome accepts open() only while the click still counts as a user gesture, which any await before it ends.
  chrome.sidePanel.open({ windowId: tab.windowId });
  startLinkSummaryJob(info.linkUrl);
});
