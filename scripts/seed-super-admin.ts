import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";

const EMAIL = "tosan.oru@gmail.com";
const PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "2oolsbox2";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, EMAIL))
    .limit(1);

  if (existing) {
    await db
      .update(schema.users)
      .set({ passwordHash, isSuperAdmin: true })
      .where(eq(schema.users.id, existing.id));
    console.log(`↺ Updated existing user ${EMAIL}: password set + isSuperAdmin=true`);
  } else {
    await db.insert(schema.users).values({ email: EMAIL, name: "Tosan Oru", passwordHash, isSuperAdmin: true });
    console.log(`+ Inserted super admin ${EMAIL}`);
  }

  const [row] = await db
    .select({ email: schema.users.email, isSuperAdmin: schema.users.isSuperAdmin, hasPassword: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.email, EMAIL))
    .limit(1);
  console.log("Verify:", row.email, "isSuperAdmin=" + row.isSuperAdmin, "hasPassword=" + Boolean(row.hasPassword));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
