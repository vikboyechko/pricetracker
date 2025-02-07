// Initialize extension when installed
chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage with empty price history
  chrome.storage.local.set({
    priceHistory: {}
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'open-popup') {
    chrome.windows.create({
      url: 'popup.html',
      type: '.popup',
      width: 300,
      height: 200,
    });
    return true;
  }
  if (request.action === 'get-product-title') {
    const title = document.title.replace(/^Amazon.com: /, '');
    sendResponse({ title });
  }
});
