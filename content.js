// content.js

let priceHistoryElement = null;
let isInitialized = false;
let observer = null;

function getCurrentPrice() {
  console.log('Price History Extension: Starting price detection...');

  try {
    // First check for Schema.org structured data
    const schemaPriceElement = document.querySelector(
      '[itemprop="price"], [data-product-price], [data-price]'
    );
    if (schemaPriceElement) {
      const schemaPrice = parseFloat(
        schemaPriceElement.getAttribute('content') || schemaPriceElement.textContent
      );
      if (!isNaN(schemaPrice) && schemaPrice > 0) {
        console.log('Using schema.org price:', schemaPrice);
        return { price: schemaPrice, element: schemaPriceElement };
      }
    }

    // Fallback to text-based detection
    const elements = Array.from(document.getElementsByTagName('*')).filter((el) => {
      const text = el.textContent || '';
      return text.includes('$');
    });

    const pricesWithDetails = elements
      .map((el) => {
        try {
          const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
          const rect = el.getBoundingClientRect();
          const verticalPosition = rect.top + window.scrollY;
          const domHierarchyScore = el.closest('.price, .product-price') ? 100 : 0;

          // Enhanced price regex with international support
          const priceMatch = el.textContent.match(
            /(?<![a-zA-Z]\s*)\$\s*([\d.,]+)/ // Capture both . and ,
          );

          if (priceMatch) {
            let priceStr = priceMatch[1]
              .replace(/[.,](?=\d{0,2}$)/g, 'D') // Temporary mark decimal
              .replace(/[.,]/g, '') // Remove other separators
              .replace('D', '.'); // Restore decimal

            const price = parseFloat(priceStr);

            // Price validation
            if (isNaN(price) || price < 0.01 || price > 100000) {
              return null;
            }

            // Scoring system
            const score =
              fontSize * 2 +
              domHierarchyScore +
              (price > 10 && price < 10000 ? 50 : 0) +
              (el.offsetParent ? 30 : 0);

            return {
              element: el,
              price,
              fontSize,
              verticalPosition,
              score,
            };
          }
        } catch (e) {
          console.error('Error processing element:', e);
          return null;
        }
      })
      .filter(Boolean);

    if (pricesWithDetails.length === 0) return { price: null, element: null };

    // Select highest scoring price
    const selectedPrice = pricesWithDetails.sort((a, b) => b.score - a.score)[0];
    console.log('Selected price:', selectedPrice);
    return {
      price: selectedPrice.price,
      element: selectedPrice.element,
    };
  } catch (error) {
    console.error('Price detection error:', error);
    return { price: null, element: null };
  }
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
}

function createPriceHistoryElement(lowestPrice, lowestPriceDate) {
  const host = document.createElement('div');
  host.id = 'price-history-tracker';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host {
        display: block;
        background-color: #ff9800;
        color: white;
        padding: 10px;
        margin: 10px 0;
        border-radius: 4px;
        font-family: Arial, sans-serif;
        width: fit-content;
        line-height: normal;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      }
      .container {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    </style>
    <div class="container">
      <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12.8 11V9.3H11.2V11H12.8ZM12.8 15.5V13H11.2V15.5H12.8ZM12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Zm0-1.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z"/>
      </svg>
      <span>Lowest: $${lowestPrice.toFixed(2)} • ${formatDate(new Date(lowestPriceDate))}</span>
    </div>
  `;

  return host;
}

async function trackPrice() {
  try {
    if (document.querySelector('#price-history-tracker')) return;

    const { price: currentPrice, element: priceElement } = getCurrentPrice();
    if (!currentPrice || !priceElement) return;

    const currentUrl = window.location.href;
    const result = await chrome.storage.local.get(currentUrl);
    const priceHistory = result[currentUrl] || {
      lowestPrice: Infinity,
      lowestPriceDate: null,
      prices: [],
    };

    const today = new Date().toISOString();
    priceHistory.prices.push({
      price: currentPrice,
      date: today,
    });

    if (currentPrice < priceHistory.lowestPrice) {
      priceHistory.lowestPrice = currentPrice;
      priceHistory.lowestPriceDate = today;
    }

    await chrome.storage.local.set({
      [currentUrl]: priceHistory,
    });

    // Wait for DOM stabilization
    await new Promise((resolve) => requestAnimationFrame(resolve));

    priceHistoryElement = createPriceHistoryElement(
      priceHistory.lowestPrice,
      priceHistory.lowestPriceDate
    );

    const insertionPoint =
      priceElement.closest(`
      .price, .product-price, [class*="price"],
      .product-details__price, .pdp-price,
      .productPrice, #productPrice
    `) || document.body;

    insertionPoint.appendChild(priceHistoryElement);
    console.log('Element inserted at:', insertionPoint);
  } catch (error) {
    console.error('Price tracking error:', error);
  }
}

function removePriceTracker() {
  const tracker = document.querySelector('#price-history-tracker');
  if (tracker) {
    tracker.remove();
  }
}

function initialize() {
  // Initialize tracking state
  chrome.storage.local.get(['trackingOptions'], function (result) {
    const options = result.trackingOptions || {
      trackDomain: false,
      trackPage: false,
      trackingEnabled: false,
    };

    if (!options.trackingEnabled) return;

    // Rest of your existing initialize() function here...
  });

  if (isInitialized) return;
  isInitialized = true;

  observer = new MutationObserver((mutations) => {
    if (!document.querySelector('#price-history-tracker')) {
      trackPrice();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  });

  // Run immediately and retry with backoff
  const retryInterval = setInterval(() => {
    if (document.readyState === 'complete') {
      trackPrice();
      clearInterval(retryInterval);
    }
  }, 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Function to create or update the price display
function updatePriceDisplay(lowestPrice, date) {
  const existingDisplay = document.getElementById('price-tracker-unique-display');
  if (existingDisplay) {
    existingDisplay.remove();
  }

  const display = document.createElement('div');
  display.id = 'price-tracker-unique-display';
  display.className = 'price-tracker-banner';
  
  // Create a style element for our CSS reset and specific styles
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    #price-tracker-unique-display.price-tracker-banner {
      all: initial;
      display: block !important;
      background-color: #f89f34 !important;
      color: white !important;
      padding: 8px 16px !important;
      border-radius: 8px !important;
      font-family: Arial, sans-serif !important;
      font-size: 16px !important;
      font-weight: 500 !important;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
      position: relative !important;
      z-index: 9999 !important;
      margin: 10px 0 !important;
      width: fit-content !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    #price-tracker-unique-display.price-tracker-banner * {
      all: revert;
      font-family: Arial, sans-serif !important;
      color: white !important;
      margin: 0 !important;
      padding: 0 !important;
      line-height: normal !important;
      font-size: 16px !important;
    }

    #price-tracker-unique-display .price-tracker-content {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }

    #price-tracker-unique-display .price-tracker-icon {
      font-size: 18px !important;
      color: white !important;
    }
  `;

  document.head.appendChild(styleElement);

  // Create wrapper for content
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'price-tracker-content';

  // Add info icon
  const infoIcon = document.createElement('span');
  infoIcon.innerHTML = 'ⓘ';
  infoIcon.className = 'price-tracker-icon';

  // Add text content
  const textContent = document.createElement('span');
  textContent.textContent = `Lowest: ${lowestPrice} • ${date}`;
  textContent.className = 'price-tracker-text';

  // Assemble the elements
  contentWrapper.appendChild(infoIcon);
  contentWrapper.appendChild(textContent);
  display.appendChild(contentWrapper);

  const targetElement = document.querySelector('[your-target-selector]');
  if (targetElement) {
    targetElement.insertAdjacentElement('beforebegin', display);
  }
}
