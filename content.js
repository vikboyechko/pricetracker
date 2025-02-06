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
  
  // First try schema price
  const schemaInfo = getSchemaInfo();
  if (schemaInfo?.price) {
    const price = Number(schemaInfo.price);
    if (!isNaN(price) && price > 0) {
      return { price, element: null };
    }
  }
  
  // Find all elements with prices
  const elements = Array.from(document.getElementsByTagName('*')).filter(el => {
    const text = el.textContent || '';
    return text.includes('$');
  });
  
  // Get all prices with their font sizes
  const pricesWithDetails = elements.map(el => {
    try {
      const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
      const rect = el.getBoundingClientRect();
      const verticalPosition = rect.top + window.scrollY;
      
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
          elementContext.includes('original $')) {
        return null;
      }
      
      // Look for price pattern
      let priceMatch = el.textContent.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
      if (!priceMatch) {
        // Try parent if no direct match (might help with split prices)
        priceMatch = el.parentElement?.textContent.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
      }
      
      if (priceMatch) {
        const priceStr = priceMatch[1].replace(/,/g, '');
        const price = Number(priceStr);
        
        if (!isNaN(price) && price > 0) {
          // Prioritize sale prices
          const fontBonus = elementContext.includes('sale') || 
                           elementContext.includes('now') || 
                           elementContext.includes('special buy') ? 10 : 0;
          
          console.log('Found price:', {
            price,
            fontSize,
            bonus: fontBonus,
            text: el.textContent.trim()
          });
          
          return {
            element: el,
            price,
            fontSize: fontSize + fontBonus,
            verticalPosition
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

  // Log all found prices for debugging
  console.log('All prices found:', pricesWithDetails.map(p => ({
    price: p.price,
    fontSize: p.fontSize,
    text: p.element.textContent.trim()
  })));

  // Sort by font size (largest first)
  pricesWithDetails.sort((a, b) => b.fontSize - a.fontSize);
  
  // Get prices with the largest font size
  const maxFontSize = pricesWithDetails[0].fontSize;
  const largestPrices = pricesWithDetails.filter(p => p.fontSize === maxFontSize);
  
  // Among equal font sizes, pick the highest one on the page
  largestPrices.sort((a, b) => a.verticalPosition - b.verticalPosition);
  
  const selectedPrice = largestPrices[0];
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