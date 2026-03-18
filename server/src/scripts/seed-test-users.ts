import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { connectDatabase } from "../config/database.js";
import { UserModel } from "../models/user.model.js";

dotenv.config();

const ROLE_NAME = "Team Member - KūKri 1";
const ROLE_ID = "699d6d9acf47d60c5ab7f118";
const COUNT = 15;
const SALT_ROUNDS = 10;

const firstNames = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey",
  "Riley", "Avery", "Quinn", "Skyler", "Drew",
  "Cameron", "Reese", "Jamie", "Sage", "Finley",
];

const lastNames = [
  "Rivera", "Chen", "Patel", "Kim", "Nguyen",
  "Garcia", "Martinez", "Lopez", "Singh", "Tanaka",
  "Ali", "Okafor", "Müller", "Costa", "Park",
];

async function seed() {
  try {
    await connectDatabase();
    const hashedPassword = await bcrypt.hash("TestPassword1!", SALT_ROUNDS);

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < COUNT; i++) {
      const firstName = firstNames[i]!;
      const lastName = lastNames[i]!;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@test-tikka.com`;

      const exists = await UserModel.findOne({ email }).lean();
      if (exists) {
        console.log(`  ⏭  Skipped (exists): ${email}`);
        skipped++;
        continue;
      }

      await new UserModel({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: ROLE_NAME,
        roleId: ROLE_ID,
        isActive: true,
        status: "active",
      }).save();

      console.log(`  ✅ Created: ${firstName} ${lastName} <${email}>`);
      created++;
    }

    console.log(`\nDone. Created: ${created}, Skipped: ${skipped}\n`);
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
