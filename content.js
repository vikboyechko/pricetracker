// content.js
function getSchemaInfo() {
  const jsonLdElements = document.querySelectorAll('script[type="application/ld+json"]');
  for (const element of jsonLdElements) {
    try {
      const data = JSON.parse(element.textContent);
      const product = data['@type'] === 'Product' ? data : null;
      if (product) {
        return {
          title: product.name,
          price: product.offers?.price || null
        };
      }
    } catch (e) {
      console.log('Error parsing JSON-LD:', e);
    }
  }
  return null;
}

function getCurrentPrice() {
  console.log('Price History Extension: Starting price detection...');
  
  const hostname = window.location.hostname;
  
  // First try schema price
  const schemaInfo = getSchemaInfo();
  if (schemaInfo?.price) {
    const price = Number(schemaInfo.price);
    if (!isNaN(price) && price > 0) {
      return { price, element: null };
    }
  }

  // Site-specific selectors
  if (hostname.includes('lowes.com')) {
    const mainPriceElement = document.querySelector('[data-testid="main-price"]');
    if (mainPriceElement) {
      const priceMatch = mainPriceElement.textContent.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
      if (priceMatch) {
        const price = Number(priceMatch[1].replace(/,/g, ''));
        if (!isNaN(price) && price > 0) {
          return { price, element: mainPriceElement };
        }
      }
    }
  }
  
  if (hostname.includes('wayfair.com')) {
    // Look for the BoxV3 div and get its first span child
    const priceContainer = document.querySelector('div[data-hb-id="BoxV3"]');
    if (priceContainer) {
      const firstPriceSpan = priceContainer.querySelector('span');
      if (firstPriceSpan) {
        const priceMatch = firstPriceSpan.textContent.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
        if (priceMatch) {
          const price = Number(priceMatch[1].replace(/,/g, ''));
          if (!isNaN(price) && price > 0) {
            return { price, element: firstPriceSpan };
          }
        }
      }
    }
  }

  if (hostname.includes('amazon')) {
    // Try various Amazon price selectors
    const selectors = [
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#price_inside_buybox',
      '.a-price-whole'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const priceMatch = element.textContent.match(/\$?\s*([\d,]+(?:\.\d{2})?)/);
        if (priceMatch) {
          const price = Number(priceMatch[1].replace(/,/g, ''));
          if (!isNaN(price) && price > 0) {
            return { price, element };
          }
        }
      }
    }
  }

  // Generic price detection for other sites
  const elements = Array.from(document.getElementsByTagName('*')).filter(el => {
    const text = el.textContent || '';
    return text.includes('$');
  });
  
  // Get all prices with their font sizes
  const pricesWithDetails = elements.map(el => {
    try {
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
      
      // Get the full context including parent and siblings
      const elementContext = [
        el.textContent,
        el.parentElement?.textContent,
        [...(el.parentElement?.children || [])].map(c => c.textContent).join(' ')
      ].join(' ').toLowerCase();
      
      // Skip disqualifying prices
      if (elementContext.includes('per item') ||
          elementContext.includes('was $') ||
          elementContext.includes('reg. $') ||
          elementContext.includes('regular $') ||
          elementContext.includes('original $') ||
          elementContext.match(/\(\$[\d,.]+/)) {
        return null;
      }
      
      let priceMatch = el.textContent.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
      if (priceMatch) {
        const price = Number(priceMatch[1].replace(/,/g, ''));
        if (!isNaN(price) && price > 0) {
          return { 
            element: el,
            price,
            fontSize
          };
        }
      }
    } catch (e) {
      console.error('Error processing element:', e);
    }
    return null;
  }).filter(Boolean);
  
  if (pricesWithDetails.length === 0) {
    return { price: null, element: null };
  }

  // Sort by font size (largest first)
  pricesWithDetails.sort((a, b) => b.fontSize - a.fontSize);
  
  const selectedPrice = pricesWithDetails[0];
  console.log('Selected price:', {
    price: selectedPrice.price,
    fontSize: selectedPrice.fontSize,
    text: selectedPrice.element.textContent.trim()
  });
  
  return {
    price: selectedPrice.price,
    element: selectedPrice.element
  };
}

function getProductInfo() {
  const { price: currentPrice } = getCurrentPrice();
  if (!currentPrice) return null;

  // Get product title from various sources
  const schemaInfo = getSchemaInfo();
  let productTitle = schemaInfo?.title;
  
  if (!productTitle) {
    // Try h1
    const h1 = document.querySelector('h1');
    if (h1) {
      productTitle = h1.textContent.trim();
    }
    
    // Try meta tags if no h1
    if (!productTitle) {
      productTitle = document.querySelector('meta[property="og:title"]')?.content ||
                    document.querySelector('meta[name="title"]')?.content ||
                    document.title.split('|')[0].trim();
    }
  }
  
  if (!productTitle) return null;

  return {
    productTitle,
    currentPrice
  };
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getProductInfo') {
    const productInfo = getProductInfo();
    if (productInfo) {
      const url = window.location.href;
      
      chrome.storage.local.get(['priceHistory'], (result) => {
        const priceHistory = result.priceHistory || {};
        const productHistory = priceHistory[url] || {
          productTitle: productInfo.productTitle,
          prices: []
        };

        productHistory.prices.push({
          price: productInfo.currentPrice,
          date: new Date().toISOString()
        });

        productHistory.productTitle = productInfo.productTitle;

        priceHistory[url] = productHistory;
        chrome.storage.local.set({ priceHistory }, () => {
          sendResponse({
            productTitle: productInfo.productTitle,
            currentPrice: productInfo.currentPrice,
            lowestPrice: Math.min(...productHistory.prices.map(p => p.price)),
            lowestPriceDate: productHistory.prices.reduce((lowest, current) => 
              current.price < (lowest ? lowest.price : Infinity) ? current : lowest
            ).date
          });
        });
      });
      return true;
    } else {
      sendResponse(null);
    }
  }
  return true;
});