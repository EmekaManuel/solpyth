import * as anchor from "@coral-xyz/anchor";
import { Program, Wallet } from "@coral-xyz/anchor";
import { PriceServiceConnection } from "@pythnetwork/price-service-client";
import {
  InstructionWithEphemeralSigners,
  PythSolanaReceiver,
} from "@pythnetwork/pyth-solana-receiver";
import { PythOracle1 } from "../target/types/pyth_oracle_1";
const {
  SystemProgram,
  Keypair,
  Connection,
  PublicKey,
} = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const BTC_PRICE_FEED_ID =
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"; //BTC/USD
const HERMES_URL = "https://hermes.pyth.network/";
const DEVNET_RPC_URL =
  "https://devnet.helius-rpc.com/?api-key=bdb45793-138e-4ff8-b8f4-cd7dba5545df";
const connection = new Connection(DEVNET_RPC_URL);
const provider = anchor.AnchorProvider.env();
const wallet = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(
      fs.readFileSync(
        path.join(process.env.HOME || "", ".config/solana/id.json"),
        "utf8"
      )
    )
  )
);

describe("pyth_oracle_1", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const program = anchor.workspace.PythOracle1 as Program<PythOracle1>;

  it("Is initialized!", async () => {
    const priceServiceConnection = new PriceServiceConnection(HERMES_URL, {
      priceFeedRequestConfig: { binary: true },
    });

    const pythSolanaReceiver = new PythSolanaReceiver({
      connection: connection,
      wallet: new Wallet(wallet),
    });
    const priceUpdateData = await priceServiceConnection.getLatestVaas([
      BTC_PRICE_FEED_ID,
    ]);

    // Build transaction
    const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: true,
    });
    await transactionBuilder.addPostPriceUpdates([priceUpdateData[0]]);

    await transactionBuilder.addPriceConsumerInstructions(
      async (
        getPriceUpdateAccount: (priceFeedId: string) => typeof PublicKey
      ): Promise<InstructionWithEphemeralSigners[]> => {
        return [
          {
            instruction: await program.methods
              .sample(BTC_PRICE_FEED_ID) // Replace with your actual method and parameters
              .accounts({
                payer: wallet.publicKey,
                priceUpdate: getPriceUpdateAccount(BTC_PRICE_FEED_ID),
                // Add other required accounts here
              })
              .instruction(),
            signers: [],
          },
        ];
      }
    );

    const txs = await pythSolanaReceiver.provider.sendAll(
      await transactionBuilder.buildVersionedTransactions({
        computeUnitPriceMicroLamports: 50000,
      }),
      { skipPreflight: true }
    );
    // Display current BTC price using the same logic as our script
    console.log("\n🔍 Fetching BTC/USD price from Pyth Network...\n");
    
    try {
      const priceFeeds = await priceServiceConnection.getLatestPriceFeeds([BTC_PRICE_FEED_ID]);
      
      if (priceFeeds && priceFeeds.length > 0) {
        const priceFeed = priceFeeds[0];
        const price = priceFeed.getPriceUnchecked();
        
        console.log("=== BTC/USD PRICE DATA ===");
        console.log(`Raw Price: ${price.price}`);
        console.log(`Confidence: ${price.conf}`);
        console.log(`Exponent: ${price.expo}`);
        console.log(`Publish Time: ${new Date(price.publishTime * 1000).toISOString()}`);
        
        // Calculate actual price
        const actualPrice = Number(price.price) * Math.pow(10, price.expo);
        console.log(`\n💰 Current BTC/USD Price: $${actualPrice.toLocaleString()}`);
        
        // Calculate confidence interval
        const confidence = Number(price.conf) * Math.pow(10, price.expo);
        console.log(`📊 Confidence Interval: ±$${confidence.toLocaleString()}`);
        console.log(`📈 Price Range: $${(actualPrice - confidence).toLocaleString()} - $${(actualPrice + confidence).toLocaleString()}`);
        console.log("");
      }
    } catch (error) {
      console.error("Error fetching price data:", error);
    }

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
          console.log(" Solana Explorer:");
          console.log(
            `https://explorer.solana.com/tx/${signature}?cluster=devnet`
          );
        }
      } catch (error) {
        console.error(
          "Error fetching transaction logs for signature:",
          signature,
          error
        );
      }
    }
  });
});
