const { PriceServiceConnection } = require("@pythnetwork/price-service-client");

async function getBTCPrice() {
  const BTC_PRICE_FEED_ID =
    "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
  const HERMES_URL = "https://hermes.pyth.network/";

  try {
    console.log("🔍 Fetching BTC/USD price from Pyth Network...\n");

    const priceServiceConnection = new PriceServiceConnection(HERMES_URL, {
      priceFeedRequestConfig: { binary: true },
    });

    // Get latest price data
    const priceFeeds = await priceServiceConnection.getLatestPriceFeeds([
      BTC_PRICE_FEED_ID,
    ]);

    if (priceFeeds && priceFeeds.length > 0) {
      const priceFeed = priceFeeds[0];
      const price = priceFeed.getPriceUnchecked();

      console.log("=== BTC/USD PRICE DATA ===");
      console.log(`Raw Price: ${price.price}`);
      console.log(`Confidence: ${price.conf}`);
      console.log(`Exponent: ${price.expo}`);
      console.log(
        `Publish Time: ${new Date(price.publishTime * 1000).toISOString()}`
      );

      // Calculate actual price
      const actualPrice = Number(price.price) * Math.pow(10, price.expo);
      console.log(
        `\n💰 Current BTC/USD Price: $${actualPrice.toLocaleString()}`
      );

      // Calculate confidence interval
      const confidence = Number(price.conf) * Math.pow(10, price.expo);
      console.log(`📊 Confidence Interval: ±$${confidence.toLocaleString()}`);
      console.log(
        `📈 Price Range: $${(actualPrice - confidence).toLocaleString()} - $${(
          actualPrice + confidence
        ).toLocaleString()}`
      );
    } else {
      console.log("❌ No price data found");
    }
  } catch (error) {
    console.error("❌ Error fetching price:", error.message);
  }
}

getBTCPrice();
