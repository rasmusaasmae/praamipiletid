import "server-only";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";

const appUrl = process.env.APP_URL;
if (!appUrl) throw new Error("APP_URL is not set");

export const auth = betterAuth({
  baseURL: appUrl,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [admin()],
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await db.insert(userSettings).values({ userId: created.id });
        },
      },
    },
  },
});
