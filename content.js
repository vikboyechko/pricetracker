function getCurrentPrice() {
  // Find all elements containing '$'
  const elements = Array.from(document.getElementsByTagName('*')).filter((el) => {
    const text = el.textContent || '';
    return text.includes('$') && !el.querySelector('*').textContent.includes('$'); // Only get deepest elements with $
  });

  if (elements.length === 0) return null;

  // Get computed font sizes and find the largest price
  let largestFontSize = 0;
  let priceWithLargestFont = null;

  elements.forEach((el) => {
    const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
    const priceMatch = el.textContent.match(/\$\s*(\d+(?:\.\d{2})?)/);

    if (priceMatch && fontSize > largestFontSize) {
      largestFontSize = fontSize;
      priceWithLargestFont = parseFloat(priceMatch[1]);
    }
  });

  return priceWithLargestFont;
}

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
}

function createPriceHistoryElement(lowestPrice, lowestPriceDate) {
  const container = document.createElement('div');
  container.style.backgroundColor = '#ff9800'; // Orange background
  container.style.color = 'white';
  container.style.padding = '10px';
  container.style.marginTop = '10px';
  container.style.borderRadius = '4px';
  container.style.fontFamily = 'Arial, sans-serif';

  container.textContent = `Lowest: $${lowestPrice.toFixed(2)} • ${formatDate(
    new Date(lowestPriceDate)
  )}`;

  return container;
}

async function trackPrice() {
  const currentPrice = getCurrentPrice();
  if (!currentPrice) return;

  const currentUrl = window.location.href;

  // Get existing price history from storage
  const result = await chrome.storage.local.get(currentUrl);
  const priceHistory = result[currentUrl] || {
    lowestPrice: Infinity,
    lowestPriceDate: null,
    prices: [],
  };

  // Update price history
  const today = new Date().toISOString();
  priceHistory.prices.push({
    price: currentPrice,
    date: today,
  });

  // Update lowest price if current price is lower
  if (currentPrice < priceHistory.lowestPrice) {
    priceHistory.lowestPrice = currentPrice;
    priceHistory.lowestPriceDate = today;
  }

  // Save updated price history
  await chrome.storage.local.set({
    [currentUrl]: priceHistory,
  });

  // Display price history
  const priceElement = document.querySelector('.price');
  if (priceElement) {
    const historyElement = createPriceHistoryElement(
      priceHistory.lowestPrice,
      priceHistory.lowestPriceDate
    );
    priceElement.parentNode.insertBefore(historyElement, priceElement.nextSibling);
  }
}

// Run price tracking when page loads
trackPrice();
