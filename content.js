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
    // Look for the SFPrice container
    const priceContainer = document.querySelector('.SFPrice');
    if (priceContainer) {
      // Get all spans and find the first one that doesn't contain "per item"
      const spans = Array.from(priceContainer.getElementsByTagName('span'));
      for (const span of spans) {
        if (!span.textContent.includes('per item')) {
          const priceMatch = span.textContent.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
          if (priceMatch) {
            const price = Number(priceMatch[1].replace(/,/g, ''));
            if (!isNaN(price) && price > 0) {
              return { price, element: span };
            }
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

  // Get product title from meta tags or document title
  let productTitle = document.querySelector('meta[name="title"]')?.content || 
                    document.title;
  
  // Remove "Amazon.com:" prefix if present
  productTitle = productTitle.replace(/^Amazon\.com:\s*/i, '').trim();
  
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

async function savePriceHistory(productId, price) {
  const key = `price_history_${productId}`;
  const now = new Date().toISOString();
  
  try {
    const result = await chrome.storage.local.get(key);
    let history = result[key] || [];
    
    if (history.length === 0 || history[history.length - 1].price !== price) {
      history.push({
        price: price,
        timestamp: now
      });
      
      if (history.length > 30) {
        history = history.slice(-30);
      }
      
      await chrome.storage.local.set({ [key]: history });
      console.log(`Saved price ${price} for product ${productId}`);
    } else {
      console.log(`Price ${price} already recorded for product ${productId}`);
    }
  } catch (error) {
    console.error('Error saving price history:', error);
  }
}

async function startPriceDetection() {
  const priceInfo = await getCurrentPrice();
  if (priceInfo) {
    console.log('Price element found:', priceInfo);
    insertPriceHistoryElement(priceInfo);
    
    // Add this line to save price
    const url = window.location.href;
    const productId = url.split('/').pop().split('?')[0]; // Simple ID extraction
    if (productId && priceInfo.price) {
      savePriceHistory(productId, priceInfo.price);
    }
  } else {
    console.log('No price element found');
  }
}

chrome.runtime.sendMessage({ action: 'get-product-title' }, response => {
  if (response && response.title) {
    console.log('Product title:', response.title);
  } else {
    console.log('Product title not found');
  }
});