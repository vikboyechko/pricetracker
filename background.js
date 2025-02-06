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
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggle-option') {
    chrome.storage.local.get(['trackingOptions'], function (result) {
      const options = result.trackingOptions || {
        trackDomain: false,
        trackPage: false,
        trackingEnabled: false,
      };

      switch (request.option) {
        case 'track-domain':
          options.trackDomain = !options.trackDomain;
          break;
        case 'track-page':
          options.trackPage = !options.trackPage;
          break;
        case 'toggle-tracking':
          options.trackingEnabled = !options.trackingEnabled;
          break;
      }

      chrome.storage.local.set({ trackingOptions: options });
    });
  }
});
