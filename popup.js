document.addEventListener('DOMContentLoaded', function () {
  const productInfo = document.createElement('div');
  productInfo.id = 'productInfo';
  document.body.appendChild(productInfo);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getProductInfo' }, (response) => {
      try {
        if (chrome.runtime.lastError || !response) {
          productInfo.innerHTML = '<p class="no-product">No product detected on this page</p>';
          return;
        }

        if (response.productTitle && response.currentPrice) {
          // Parse prices safely
          let currentPrice = 0;
          let lowestPrice = 0;
          
          try {
            currentPrice = Number(response.currentPrice);
            lowestPrice = Number(response.lowestPrice);
          } catch (e) {
            console.error('Error parsing prices:', e);
          }

          const lowestPriceDate = new Date(response.lowestPriceDate || new Date()).toLocaleDateString();
          
          productInfo.innerHTML = `
            <h2 class="product-title">${response.productTitle}</h2>
            <p class="current-price">Current: $${(currentPrice || 0).toFixed(2)}</p>
            <p class="lowest-price">Lowest: $${(lowestPrice || 0).toFixed(2)}</p>
            <p class="price-date">on ${lowestPriceDate}</p>
          `;
        } else {
          productInfo.innerHTML = '<p class="no-product">No product detected on this page</p>';
        }
      } catch (e) {
        console.error('Error handling response:', e);
        productInfo.innerHTML = '<p class="no-product">Error processing product data</p>';
      }
    });
  });
});