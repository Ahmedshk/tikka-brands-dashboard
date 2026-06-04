/**
 * One-shot: for each buyerGuid + orderNumber with both sent and delivery cache rows,
 * run latest-wins status reconcile using stored `fetchedAt` (fixes divergent pairs).
 *
 * Run: npm run reconcile-marketman-order-status-siblings
 * Optional: --buyer-guid=<guid> --order-number=<po>
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "../config/database.js";
import { MarketManOrderCacheModel } from "../models/marketmanOrderCache.model.js";
import { reconcileMarketManOrderStatusWithSibling } from "../utils/marketmanOrderCacheStatusSync.util.js";
import { logger } from "../utils/logger.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length).trim() || undefined;
  }
  return undefined;
}

async function main(): Promise<void> {
  const buyerGuidFilter = parseArg("buyer-guid");
  const orderNumberFilter = parseArg("order-number");

  await connectDatabase();

  const match: Record<string, unknown> = {};
  if (buyerGuidFilter) match.buyerGuid = buyerGuidFilter;
  if (orderNumberFilter) match.orderNumber = orderNumberFilter;

  const pairs = await MarketManOrderCacheModel.aggregate<{
    _id: { buyerGuid: string; orderNumber: string };
    sent?: { fetchedAt: Date; raw: Record<string, unknown> };
    delivery?: { fetchedAt: Date; raw: Record<string, unknown> };
  }>([
    { $match: match },
    {
      $group: {
        _id: { buyerGuid: "$buyerGuid", orderNumber: "$orderNumber" },
        rows: {
          $push: {
            apiKind: "$apiKind",
            fetchedAt: "$fetchedAt",
            raw: "$raw",
          },
        },
      },
    },
    {
      $project: {
        sent: {
          $first: {
            $filter: {
              input: "$rows",
              as: "r",
              cond: { $eq: ["$$r.apiKind", "sent"] },
            },
          },
        },
        delivery: {
          $first: {
            $filter: {
              input: "$rows",
              as: "r",
              cond: { $eq: ["$$r.apiKind", "delivery"] },
            },
          },
        },
      },
    },
    {
      $match: {
        sent: { $ne: null },
        delivery: { $ne: null },
      },
    },
  ]).exec();

  let reconciled = 0;
  let unchanged = 0;
  let errors = 0;

  for (const pair of pairs) {
    const { buyerGuid, orderNumber } = pair._id;
    const sent = pair.sent!;
    const delivery = pair.delivery!;
    const sentMs = new Date(sent.fetchedAt).getTime();
    const deliveryMs = new Date(delivery.fetchedAt).getTime();

    const sourceWins = sentMs >= deliveryMs;
    const sourceApiKind = sourceWins ? "sent" : "delivery";
    const sourceRow = sourceWins ? sent : delivery;
    const sourceFetchedAt = new Date(sourceRow.fetchedAt);

    try {
      const result = await reconcileMarketManOrderStatusWithSibling({
        buyerGuid,
        orderNumber,
        sourceApiKind,
        sourceOrderRaw: sourceRow.raw,
        sourceFetchedAt,
      });
      if (result.reconciled) reconciled += 1;
      else unchanged += 1;
    } catch (err) {
      errors += 1;
      logger.error("reconcile-marketman-order-status-siblings: pair failed", {
        buyerGuid,
        orderNumber,
        err,
      });
    }
  }

  logger.info("reconcile-marketman-order-status-siblings: done", {
    pairs: pairs.length,
    reconciled,
    unchanged,
    errors,
    buyerGuidFilter: buyerGuidFilter ?? null,
    orderNumberFilter: orderNumberFilter ?? null,
  });

  await MarketManOrderCacheModel.db.close();
}

main().catch((err) => {
  logger.error("reconcile-marketman-order-status-siblings: fatal", err);
  process.exit(1);
});
