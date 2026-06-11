import dotenv from "dotenv";
import mongoose, { Types } from "mongoose";
import { connectDatabase } from "../config/database.js";
import { GoogleBusinessReviewModel } from "../models/googleBusinessReview.model.js";
import { GoogleBusinessLocationSyncStateModel } from "../models/googleBusinessLocationSyncState.model.js";
import { LocationRepository } from "../repositories/location.repository.js";
import {
  SEED_GBP_LOCATION_IDS,
  SEED_GBP_REVIEW_ID_PREFIX,
  buildSeedGoogleBusinessReviewDoc,
  defaultSeedReviewSpecsForLocation,
} from "../utils/seedGoogleBusinessReviewsHelpers.js";
import { logger } from "../utils/logger.util.js";

dotenv.config();

function parseArgs(argv: string[]): { clear: boolean } {
  return { clear: argv.includes("--clear") };
}

async function seedGoogleBusinessReviews(): Promise<void> {
  const { clear } = parseArgs(process.argv.slice(2));
  await connectDatabase();

  const locationRepo = new LocationRepository();
  const syncedAt = new Date();
  let totalUpserted = 0;

  for (let i = 0; i < SEED_GBP_LOCATION_IDS.length; i += 1) {
    const locationIdStr = SEED_GBP_LOCATION_IDS[i]!;
    const locationOid = new Types.ObjectId(locationIdStr);

    const location = await locationRepo.findById(locationIdStr);
    if (!location) {
      console.warn(`⚠️  Location not found, skipping: ${locationIdStr}`);
      continue;
    }

    const storeLabel = location.storeName?.trim() || locationIdStr;
    console.log(`\n📍 ${storeLabel} (${locationIdStr})`);

    if (clear) {
      const deleted = await GoogleBusinessReviewModel.deleteMany({
        locationId: locationOid,
        googleReviewId: { $regex: `^${SEED_GBP_REVIEW_ID_PREFIX}` },
      });
      console.log(`   Cleared ${deleted.deletedCount ?? 0} prior seed review(s)`);
    }

    const specs = defaultSeedReviewSpecsForLocation(i);
    const docs = specs.map((spec) =>
      buildSeedGoogleBusinessReviewDoc(locationOid, locationIdStr, spec, syncedAt),
    );

    const bulkOps = docs.map((doc) => ({
      updateOne: {
        filter: { locationId: locationOid, googleReviewId: doc.googleReviewId },
        update: {
          $set: {
            googleReviewName: doc.googleReviewName,
            starRating: doc.starRating,
            starRatingNumeric: doc.starRatingNumeric,
            reviewer: doc.reviewer,
            createTime: doc.createTime,
            updateTime: doc.updateTime,
            lastSyncedAt: doc.lastSyncedAt,
            ...(doc.comment != null ? { comment: doc.comment } : {}),
            ...(doc.reviewReply != null ? { reviewReply: doc.reviewReply } : {}),
          },
          $setOnInsert: {
            locationId: doc.locationId,
            googleReviewId: doc.googleReviewId,
            firstSyncedAt: doc.firstSyncedAt,
          },
        },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      const result = await GoogleBusinessReviewModel.bulkWrite(bulkOps, { ordered: false });
      const upserted = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
      totalUpserted += upserted;
      console.log(`   Upserted ${docs.length} seed review(s) (${result.upsertedCount ?? 0} new)`);
    }

    const [aggregateRow] = await GoogleBusinessReviewModel.aggregate<{
      count: number;
      sum: number;
    }>([
      { $match: { locationId: locationOid } },
      { $group: { _id: null, count: { $sum: 1 }, sum: { $sum: "$starRatingNumeric" } } },
    ]);
    const reviewsInDb = aggregateRow?.count ?? 0;
    const averageRating =
      reviewsInDb > 0 ? Math.round(((aggregateRow?.sum ?? 0) / reviewsInDb) * 10) / 10 : 0;
    const googleAccountId = location.googleBusinessAccountId?.trim() || "seed-account";
    const googleLocationId = location.googleBusinessLocationId?.trim() || `seed-location-${locationIdStr.slice(-6)}`;

    await GoogleBusinessLocationSyncStateModel.findOneAndUpdate(
      { locationId: locationOid },
      {
        locationId: locationOid,
        googleAccountId,
        googleLocationId,
        googleTotalReviewCount: reviewsInDb,
        googleAverageRating: averageRating,
        lastSyncCompletedAt: syncedAt,
        lastSyncStatus: "success",
        lastSyncError: undefined,
        reviewsInDb,
      },
      { upsert: true },
    );

    console.log(
      `   Sync state: ${reviewsInDb} reviews in DB, seed avg ${averageRating} (overall KPI uses sync state)`,
    );
    console.log(
      `   Alert QA: 2★ and 1★ reviews have updateTime within the last hour for low-rating alert tests`,
    );
  }

  console.log(`\n✅ Seed complete. ${totalUpserted} review write(s) across ${SEED_GBP_LOCATION_IDS.length} location(s).`);
  console.log("   Re-run with --clear to remove prior seed reviews for these locations first.\n");
}

seedGoogleBusinessReviews()
  .then(() => {
    void mongoose.disconnect();
    process.exit(0);
  })
  .catch((error) => {
    logger.error("seed-google-business-reviews failed", error);
    console.error("\n❌ Seed failed:", error);
    void mongoose.disconnect();
    process.exit(1);
  });
