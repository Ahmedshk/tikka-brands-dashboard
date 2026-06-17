/**
 * One-shot: assign sortOrder to all locations preserving current newest-first order.
 * Idempotent when re-run only if sortOrder already matches createdAt desc order.
 *
 * Run: npm run backfill-location-sort-order
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from '../config/database.js';
import { LocationModel } from '../models/location.model.js';
import { logger } from '../utils/logger.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function main(): Promise<void> {
  await connectDatabase();
  const docs = await LocationModel.find({})
    .select({ _id: 1 })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  if (docs.length === 0) {
    logger.info('No locations to backfill.');
    process.exit(0);
  }

  const ops = docs.map((doc, index) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { sortOrder: index } },
    },
  }));

  const result = await LocationModel.bulkWrite(ops);
  logger.info(
    'Backfilled location sortOrder',
    { matched: result.matchedCount, modified: result.modifiedCount, total: docs.length },
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error('backfill-location-sort-order failed', err);
  process.exit(1);
});
