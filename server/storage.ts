import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { users, type User, type InsertUser } from "../shared/schema";
import { eq } from "drizzle-orm";

// Ensure environment variables are loaded
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserTokens(googleId: string, accessToken: string, refreshToken?: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values({
      ...insertUser,
      picture: insertUser.picture || null,
      accessToken: insertUser.accessToken || null,
      refreshToken: insertUser.refreshToken || null
    }).returning();
    return result[0];
  }

  async updateUserTokens(googleId: string, accessToken: string, refreshToken?: string): Promise<void> {
    await db.update(users)
      .set({ 
        accessToken, 
        refreshToken: refreshToken || null 
      })
      .where(eq(users.googleId, googleId));
  }
}

export const storage = new DatabaseStorage();
