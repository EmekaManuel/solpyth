# Using Pyth Price Feeds on Solana with Anchor

## Dependencies

| Dependency                        | Version |
| --------------------------------- | ------- |
| anchor-lang                       | 0.31.1  |
| pyth-solana-receiver-sdk          | 0.6.1   |
| @coral-xyz/anchor                 | ^0.31.1 |
| @pythnetwork/hermes-client        | ^1.0.4  |
| @pythnetwork/price-service-client | ^1.9.0  |
| @pythnetwork/pyth-solana-receiver | ^0.8.0  |
| @solana/web3.js                   | ^1.95.2 |
| rpc-websockets                    | ^7.11.2 |
| ws                                | ^8.18.0 |
| @types/bn.js                      | ^5.1.0  |
| @types/chai                       | ^4.3.0  |
| @types/mocha                      | ^9.0.0  |
| @types/ws                         | ^8.5.12 |
| chai                              | ^4.3.4  |
| mocha                             | ^9.0.3  |
| prettier                          | ^2.6.2  |
| ts-mocha                          | ^10.0.0 |
| typescript                        | ^4.3.5  |

## Overview

Price feeds are essential for DeFi applications - they let smart contracts access real-time market data. Pyth Network provides high-frequency, low-latency price feeds directly on-chain, which makes it perfect for Solana apps. In this guide, we'll build a Solana program using Anchor that fetches and displays real-time crypto price data from Pyth Network.

Once you understand the basic flow, integrating pyth would be very straightforward. The trickiest part is usually just getting all the dependencies configured properly.

**What we'll cover:**

- Setting up a Solana development environment with Anchor and Pyth Network integration
- Creating a smart contract that fetches real-time price data from Pyth Network
- Building a client-side application to interact with your price feed program
- Handling price data with confidence intervals and proper error checking
- Deploying and testing your program on Solana devnet

**What You Will Need:**

- Node.js (version 16.15 or higher) installed
- TypeScript experience and ts-node installed
- Basic knowledge of Rust programming
- Experience with Solana fundamentals (Guide: [Solana Developer Quickstart](https://docs.solana.com/developers))
- Experience with Anchor Framework (Guide: [Getting Started with Anchor](https://www.anchor-lang.com/docs/installation))
- A Solana wallet with devnet SOL (we'll help you get this)
- A modern web browser (e.g., Google Chrome)

Expect this to take about 2-3 hours if you're doing it for the first time.

## Finding Price Feed IDs

Before we start coding, you'll need to know where to get the price feed IDs for the cryptocurrencies you want to track. **This is essential for the entire tutorial**, so let's cover it first.

### Where to get price feed IDs

Pyth Network provides price feeds for hundreds of assets. You can find all available price feed IDs at:

**🔗 [Pyth Network Price Feed IDs](https://pyth.network/developers/price-feed-ids)**

This page shows all available price feeds with their:

- Asset names (BTC/USD, ETH/USD, SOL/USD, etc.)
- Hex-encoded feed IDs (64-character strings starting with 0x)

### Common price feed IDs you'll use

Here are some frequently used price feed IDs for this tutorial:

```javascript
// Bitcoin (BTC/USD)
const BTC_PRICE_FEED_ID =
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";

// Ethereum (ETH/USD)
const ETH_PRICE_FEED_ID =
  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

// Solana (SOL/USD)
const SOL_PRICE_FEED_ID =
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
```

**Important**: Always copy the feed ID exactly as shown on the Pyth website - these are 64-character hexadecimal strings and any typo will cause your program to fail.

## Setting up the project

We'll start by creating a new Anchor project and configuring it to work with Pyth Network.

### Create your Anchor project

Open your terminal and run:

```bash
anchor init pyth-price-feed
cd pyth-price-feed
```

This creates a new Anchor project with all the necessary files and dependencies. You should see a structure like this:

```
pyth-price-feed/
├── Anchor.toml
├── Cargo.toml
├── package.json
├── programs/
│   └── pyth_price_feed/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs
└── tests/
    └── pyth_price_feed.ts
```

### Configure your dependencies

Now we need to add the Pyth Network dependencies to our project. Open `programs/pyth_price_feed/Cargo.toml` and add the Pyth SDK:

```toml
[dependencies]
anchor-lang = "0.31.1"
pyth-solana-receiver-sdk = "0.6.1"
```

Next, update your `package.json` to include the necessary client-side dependencies:

```json
{
  "dependencies": {
    "@coral-xyz/anchor": "^0.31.1",
    "@pythnetwork/hermes-client": "^1.0.4",
    "@pythnetwork/price-service-client": "^1.9.0",
    "@pythnetwork/pyth-solana-receiver": "^0.8.0",
    "@solana/web3.js": "^1.95.2",
    "rpc-websockets": "^7.11.2"
  }
}
```

Run `yarn install` to install all dependencies:

```bash
yarn install
```

Your project should now be set up with all the necessary Pyth Network dependencies. Time to build our smart contract.

## Creating the price feed program

Now we'll create a Solana program that can fetch and display real-time price data from Pyth Network. This program will get the current Bitcoin price with confidence intervals.

### Build your smart contract

Open `programs/pyth_price_feed/src/lib.rs` and replace the existing code with our price feed implementation:

```rust
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

declare_id!("11111111111111111111111111111111");

#[derive(Accounts)]
#[instruction(feed_id: String)]
pub struct GetPrice<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    // This account contains the latest price data from Pyth Network
    pub price_update: Account<'info, PriceUpdateV2>,
}

#[program]
pub mod pyth_price_feed {

    use super::*;

    pub fn get_price(ctx: Context<GetPrice>, feed_id: String) -> Result<()> {
        let price_update = &ctx.accounts.price_update;

        // We don't want stale prices - 30 seconds max
        let maximum_age: u64 = 30;

        // Convert the hex feed ID to bytes
        let feed_id_bytes: [u8; 32] = get_feed_id_from_hex(&feed_id)?;

        // This is where the magic happens - fetching live prices
        let price = price_update.get_price_no_older_than(
            &Clock::get()?,
            maximum_age,
            &feed_id_bytes
        )?;

        // Log the price information
        msg!(
            "Price: ({} ± {}) * 10^{}",
            price.price,
            price.conf,
            price.exponent
        );

        // Log additional details for debugging
        msg!("Feed ID: {}", feed_id);
        msg!("Publish Time: {}", price.publish_time);

        Ok(())
    }
}
```

Here's what this code does: We import the necessary Pyth Network SDK components, define the accounts our program needs (a payer and the price update account), and create a function that takes a feed ID, fetches the current price with confidence intervals, and logs the results.

One thing that caught me off guard initially - the price comes with an exponent, so you need to do some math to get the actual human-readable price. We'll handle that in the client code.

### Configure your Anchor.toml

Update your `Anchor.toml` to configure the development environment:

```toml
[toolchain]
anchor_version = "0.31.1"

[features]
resolution = true
skip-lint = false

[programs.localnet]
pyth_price_feed = "11111111111111111111111111111111"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

### Build your program

Run the build command to compile your program:

```bash
anchor build
```

You should see output indicating that your program compiled successfully. If you get errors, double-check that all dependencies are properly installed and your Rust toolchain is up to date.

## Creating the client-side application

Now we'll create a client-side application that can interact with our price feed program and display real-time Bitcoin prices.

### Build your test script

Create a new file `tests/pyth_price_feed.ts` with our test:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program, Wallet } from "@coral-xyz/anchor";
import { PriceServiceConnection } from "@pythnetwork/price-service-client";
import {
  InstructionWithEphemeralSigners,
  PythSolanaReceiver,
} from "@pythnetwork/pyth-solana-receiver";
import { PythPriceFeed } from "../target/types/pyth_price_feed";

const {
  SystemProgram,
  Keypair,
  Connection,
  PublicKey,
} = require("@solana/web3.js");

// Configuration constants
const BTC_PRICE_FEED_ID =
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const HERMES_URL = "https://hermes.pyth.network/";
const DEVNET_RPC_URL = "https://api.devnet.solana.com";

describe("pyth_price_feed", () => {
  // Configure the client to use devnet
  const connection = new Connection(DEVNET_RPC_URL);
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PythPriceFeed as Program<PythPriceFeed>;

  it("Fetches Bitcoin price from Pyth Network", async () => {
    console.log("🔍 Fetching BTC/USD price from Pyth Network...\n");

    // Create connection to Pyth price service
    const priceServiceConnection = new PriceServiceConnection(HERMES_URL, {
      priceFeedRequestConfig: { binary: true },
    });

    // Create Pyth Solana receiver for on-chain price updates
    const pythSolanaReceiver = new PythSolanaReceiver({
      connection: connection,
      wallet: provider.wallet as Wallet,
    });

    // Get the latest price update data
    const priceUpdateData = await priceServiceConnection.getLatestVaas([
      BTC_PRICE_FEED_ID,
    ]);

    // Build transaction with price updates
    const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: true,
    });

    // Add price update to transaction
    await transactionBuilder.addPostPriceUpdates([priceUpdateData[0]]);

    // Add our program instruction to consume the price data
    await transactionBuilder.addPriceConsumerInstructions(
      async (
        getPriceUpdateAccount: (priceFeedId: string) => typeof PublicKey
      ): Promise<InstructionWithEphemeralSigners[]> => {
        return [
          {
            instruction: await program.methods
              .getPrice(BTC_PRICE_FEED_ID)
              .accounts({
                payer: provider.wallet.publicKey,
                priceUpdate: getPriceUpdateAccount(BTC_PRICE_FEED_ID),
              })
              .instruction(),
            signers: [],
          },
        ];
      }
    );

    // Send transaction to devnet
    console.log("📡 Sending transaction to Solana devnet...");
    const txs = await pythSolanaReceiver.provider.sendAll(
      await transactionBuilder.buildVersionedTransactions({
        computeUnitPriceMicroLamports: 50000,
      }),
      { skipPreflight: true }
    );

    // Display price information
    console.log("\n=== BTC/USD PRICE DATA ===");
    try {
      const priceFeeds = await priceServiceConnection.getLatestPriceFeeds([
        BTC_PRICE_FEED_ID,
      ]);

      if (priceFeeds && priceFeeds.length > 0) {
        const priceFeed = priceFeeds[0];
        const price = priceFeed.getPriceUnchecked();

        console.log(`Raw Price: ${price.price}`);
        console.log(`Confidence: ${price.conf}`);
        console.log(`Exponent: ${price.expo}`);
        console.log(
          `Publish Time: ${new Date(price.publishTime * 1000).toISOString()}`
        );

        // Calculate actual price - CORRECTED CALCULATION
        const actualPrice = Number(price.price) * Math.pow(10, price.expo);
        console.log(
          `\n💰 Current BTC/USD Price: $${actualPrice.toLocaleString()}`
        );

        // Calculate confidence interval
        const confidence = Number(price.conf) * Math.pow(10, price.expo);
        console.log(`📊 Confidence Interval: ±$${confidence.toLocaleString()}`);
        console.log(
          `📈 Price Range: $${(
            actualPrice - confidence
          ).toLocaleString()} - $${(actualPrice + confidence).toLocaleString()}`
        );
        console.log("");
      }
    } catch (error) {
      console.error("Error fetching price data:", error);
    }

    // Display transaction results
    for (const signature of txs) {
      try {
        const tx = await connection.getTransaction(
          signature,
          { maxSupportedTransactionVersion: 0 },
          { commitment: "confirmed" }
        );

        if (tx && tx.meta && tx.meta.logMessages) {
          console.log("Transaction logs:", tx.meta.logMessages);
        } else {
          console.log("✅ Transaction submitted successfully");
          console.log(
            `🔗 View on Solana Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`
          );
        }
      } catch (error) {
        console.error("Error fetching transaction logs:", error);
      }
    }
  });
});
```

### Create a standalone price script

Here's a simpler script if you just want to fetch prices without deploying a program. Create `get_btc_price.js`:

```javascript
const { PriceServiceConnection } = require("@pythnetwork/price-service-client");

async function getBTCPrice() {
  const BTC_PRICE_FEED_ID =
    "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
  const HERMES_URL = "https://hermes.pyth.network/";

  try {
    console.log("🔍 Fetching BTC/USD price from Pyth Network...");

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

      // Calculate actual price - CORRECTED CALCULATION
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
      console.log("No price data found");
    }
  } catch (error) {
    console.error("Error fetching price:", error.message);
  }
}

getBTCPrice();
```

## Deploy and test your program

Now we'll deploy our program to Solana devnet and test it with real price data.

### Set up your wallet

First, make sure you have a Solana wallet configured. If you don't have one, create it:

```bash
solana-keygen new
```

Then, switch to devnet and get some test SOL:

```bash
solana config set --url devnet
solana airdrop 2
```

### Deploy your program

Deploy your program to devnet:

```bash
anchor deploy --provider.cluster devnet
```

You should see output showing your program was deployed successfully. Copy the program ID - you'll need it for the next step.

### Update your program ID

After deployment, update the `declare_id!` in your `lib.rs` with your actual program ID:

```rust
declare_id!("YOUR_ACTUAL_PROGRAM_ID_HERE");
```

Then rebuild and redeploy:

```bash
anchor build
anchor deploy --provider.cluster devnet
```

### Run your tests

Now we can test our price feed program:

```bash
anchor test --provider.cluster devnet
```

You should see output showing the Bitcoin price being fetched and displayed. The test will connect to Pyth Network's price service, fetch the latest Bitcoin price data, submit a transaction to your program on devnet, display the current price with confidence intervals, and show transaction logs and explorer links.

## Understanding the results

When you run your program successfully, you'll see output like this:

```
🔍 Fetching BTC/USD price from Pyth Network...

=== BTC/USD PRICE DATA ===
Raw Price: 11207079591000
Confidence: 4312380772
Exponent: -8
Publish Time: 2025-08-25T14:34:08.000Z

💰 Current BTC/USD Price: $112,070.796
📊 Confidence Interval: ±$43.124
📈 Price Range: $112,027.672 - $112,113.92

Transaction logs: [
  "Program 11111111111111111111111111111111 invoke [1]",
  "Program log: Price: (11207079591000 ± 4312380772) * 10^-8",
  "Program log: Feed ID: 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "Program log: Publish Time: 1724594048",
  "Program 11111111111111111111111111111111 success"
]
```

This shows that your program successfully fetched real-time Bitcoin price data from Pyth Network. **Notice the key insight**: The raw price is `11207079591000` with an exponent of `-8`, which means the actual price is `11207079591000 * 10^-8 = $112,070.796`.

### Understanding the price calculation

The most important thing to understand is how Pyth prices work:

- **Raw Price**: The integer price value (e.g., `11207079591000`)
- **Exponent**: Power of 10 to apply (e.g., `-8`)
- **Actual Price**: `raw_price * 10^exponent`

So `11207079591000 * 10^-8 = 112070.79591 ≈ $112,070.80`

This design allows Pyth to represent prices with arbitrary precision without using floating-point numbers on-chain.

## Going further

Now that you have a working price feed, here are some ways to extend your program:

### Add multiple price feeds

You can easily add support for other cryptocurrencies by using their feed IDs from the [Pyth website](https://pyth.network/developers/price-feed-ids):

```rust
// Ethereum price feed ID
const ETH_PRICE_FEED_ID = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

// Solana price feed ID
const SOL_PRICE_FEED_ID = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
```

### Add price validation

Implement additional validation to ensure price data is reliable:

```rust
// Check if price is within reasonable bounds for BTC
if price.price < 10000 || price.price > 200000 {
    return err!(ErrorCode::InvalidPrice);
}

// Check if price is not too old (60 seconds max)
if Clock::get()?.unix_timestamp - price.publish_time > 60 {
    return err!(ErrorCode::StalePrice);
}
```

### Create a price oracle contract

Build a more sophisticated oracle that aggregates multiple price sources:

```rust
pub struct PriceOracle {
    pub prices: Vec<PriceData>,
    pub last_update: i64,
}

pub struct PriceData {
    pub feed_id: String,
    pub price: i64,
    pub confidence: u64,
    pub timestamp: i64,
}
```

## Wrapping up

That's it! You now have a working Solana program that integrates with Pyth Network to fetch real-time price data. Here's what you accomplished:

- Set up a complete Solana development environment with Anchor and Pyth Network
- Learned where to find price feed IDs for any asset you want to track
- Created a smart contract that can fetch and display real-time Bitcoin prices
- Built a client-side application to interact with your program
- Deployed and tested your program on Solana devnet
- Learned how to properly calculate prices using Pyth's raw price and exponent system
- Understood how to handle price data with confidence intervals and proper error checking

This foundation gives you everything you need to build sophisticated DeFi applications that require real-time price data. Whether you're building a DEX, lending protocol, or any other DeFi application, you now have the tools to access reliable, on-chain price feeds.

**Want to keep building?** Check out other Solana guides at [Quick Solana Guide](https://quicknode.com/guides/tags/solana).

**If you're stuck, have questions, or just want to talk about what you're building**, drop us a line on Discord or Twitter.

## We'd love your feedback

If you have any feedback on this guide, let us know. We'd love to hear from you.

## Additional resources

- [Pyth Network Documentation](https://docs.pyth.network/)
- [Pyth Price Feed IDs](https://pyth.network/developers/price-feed-ids) - **Essential for finding feed IDs**
- [Anchor Framework](https://www.anchor-lang.com/)
- [Solana Developer Resources](https://docs.solana.com/)
- [Solana Explorer](https://explorer.solana.com/) - View your transactions and program deployments
