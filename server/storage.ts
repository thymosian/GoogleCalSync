import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { users, type User, type InsertUser } from "../shared/schema";
import { eq } from "drizzle-orm";

// Ensure environment variables are loaded
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql);

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserTokens(googleId: string, accessToken: string, refreshToken?: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private async retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3, delay: number = 1000): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isConnectionError = error.message?.includes('fetch failed') ||
                                 error.message?.includes('ConnectTimeoutError') ||
                                 error.code === 'UND_ERR_CONNECT_TIMEOUT';

        if (isConnectionError && attempt < maxRetries) {
          console.log(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        } else {
          throw error;
        }
      }
    }
    throw new Error('Max retries exceeded');
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.retryOperation(async () => {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0];
    });
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return this.retryOperation(async () => {
      const result = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
      return result[0];
    });
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return this.retryOperation(async () => {
      const result = await db.insert(users).values({
        ...insertUser,
        picture: insertUser.picture || null,
        accessToken: insertUser.accessToken || null,
        refreshToken: insertUser.refreshToken || null
      }).returning();
      return result[0];
    });
  }

  async updateUserTokens(googleId: string, accessToken: string, refreshToken?: string): Promise<void> {
    return this.retryOperation(async () => {
      await db.update(users)
        .set({
          accessToken,
          refreshToken: refreshToken || null
        })
        .where(eq(users.googleId, googleId));
    });
  }
}

export const storage = new DatabaseStorage();
