import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { 
  InsertUser, users, 
  servers, Server, InsertServer,
  worlds, World, InsertWorld,
  plugins, Plugin, InsertPlugin,
  backups, Backup, InsertBackup,
  performanceMetrics, PerformanceMetric, InsertPerformanceMetric
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof createClient> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = createClient({ url: `file:${process.env.DATABASE_URL}` });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Migrations applied via raw SQL ALTER TABLE ADD COLUMN.
 * Each statement is idempotent: "duplicate column name" errors are swallowed.
 * Add new columns here instead of relying on drizzle-kit push recreating tables.
 */
const MIGRATIONS: string[] = [
  `ALTER TABLE servers ADD COLUMN javaArgs TEXT DEFAULT '-Xmx2G -Xms1G'`,
  `ALTER TABLE servers ADD COLUMN autoRestart INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE servers ADD COLUMN ramLimit INTEGER NOT NULL DEFAULT 4096`,
  `ALTER TABLE servers ADD COLUMN storageLimit INTEGER NOT NULL DEFAULT 10240`,
];

export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  if (!_client) {
    _client = createClient({ url: `file:${process.env.DATABASE_URL}` });
    _db = drizzle(_client);
  }
  for (const sql of MIGRATIONS) {
    try {
      await _client.execute(sql);
      console.log(`[Migration] Applied: ${sql.slice(0, 60)}...`);
    } catch (err: any) {
      // SQLite returns "duplicate column name" when column already exists — safe to ignore
      if (err?.message?.includes("duplicate column name") || err?.code === "SQLITE_ERROR") {
        // column already exists, skip
      } else {
        console.error(`[Migration] Failed: ${sql}\n`, err);
      }
    }
  }
}


export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createUser(user: InsertUser) {
  const db = await getDb();
  if (!db) {
    throw new Error("[Database] Cannot create user: database not available");
  }

  await db.insert(users).values(user);
  return getUserByEmail(user.email!);
}

// Server operations
export async function getServersByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(servers).where(eq(servers.ownerId, ownerId));
}

export async function getAllServers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(servers);
}

export async function getServerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(servers).where(eq(servers.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createServer(server: InsertServer) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(servers).values(server).returning({ id: servers.id });
  return getServerById(result[0].id);
}

export async function updateServer(id: number, server: Partial<InsertServer>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(servers).set(server).where(eq(servers.id, id));
  return getServerById(id);
}

export async function deleteServer(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(performanceMetrics).where(eq(performanceMetrics.serverId, id));
  await db.delete(backups).where(eq(backups.serverId, id));
  await db.delete(plugins).where(eq(plugins.serverId, id));
  await db.delete(worlds).where(eq(worlds.serverId, id));
  await db.delete(servers).where(eq(servers.id, id));
}

// World operations
export async function getWorldsByServerId(serverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(worlds).where(eq(worlds.serverId, serverId));
}

export async function createWorld(world: InsertWorld) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(worlds).values(world);
  return getWorldsByServerId(world.serverId);
}

// Plugin operations
export async function getPluginsByServerId(serverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(plugins).where(eq(plugins.serverId, serverId));
}

export async function getPluginById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(plugins).where(eq(plugins.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createPlugin(plugin: InsertPlugin) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(plugins).values(plugin);
  return getPluginsByServerId(plugin.serverId);
}

export async function updatePlugin(id: number, plugin: Partial<InsertPlugin>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(plugins).set(plugin).where(eq(plugins.id, id));
  const result = await db.select().from(plugins).where(eq(plugins.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deletePlugin(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(plugins).where(eq(plugins.id, id));
}

// Backup operations
export async function getBackupsByServerId(serverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(backups).where(eq(backups.serverId, serverId));
}

export async function createBackup(backup: InsertBackup) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(backups).values(backup);
  return getBackupsByServerId(backup.serverId);
}

// Metrics operations
export async function getMetricsByServerId(serverId: number, limit = 24) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(performanceMetrics)
    .where(eq(performanceMetrics.serverId, serverId))
    .orderBy(performanceMetrics.timestamp)
    .limit(limit);
}

export async function createMetric(metric: InsertPerformanceMetric) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(performanceMetrics).values(metric);
}
