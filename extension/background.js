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
  chrome.sidePanel.open({ windowId: tab.windowId });
});
