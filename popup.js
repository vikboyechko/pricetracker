document.addEventListener('DOMContentLoaded', function () {
  chrome.storage.local.get(['trackingOptions'], function (result) {
    const options = result.trackingOptions || {
      trackDomain: false,
      trackPage: false,
      trackingEnabled: false,
    };

    document.getElementById('track-domain').checked = options.trackDomain;
    document.getElementById('track-page').checked = options.trackPage;

    if (options.trackingEnabled) {
      document.body.style.backgroundColor = '#e8f4ff';
    }
  });

  document.getElementById('toggle-tracking').addEventListener('click', function () {
    chrome.runtime.sendMessage({ action: 'toggle-option', option: 'toggle-tracking' });
    location.reload();
  });

  document.getElementById('track-domain').addEventListener('change', function () {
    chrome.runtime.sendMessage({ action: 'toggle-option', option: 'track-domain' });
  });

  document.getElementById('track-page').addEventListener('change', function () {
    chrome.runtime.sendMessage({ action: 'toggle-option', option: 'track-page' });
  });
});
