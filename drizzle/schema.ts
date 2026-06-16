import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = sqliteTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: text("openId").unique(),
  name: text("name"),
  email: text("email").unique(),
  password: text("password"),
  loginMethod: text("loginMethod"),
  role: text("role").default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).defaultNow().notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).defaultNow().notNull(),
});

export const servers = sqliteTable("servers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("ownerId").references(() => users.id).notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'java' | 'bedrock'
  port: integer("port").notNull(),
  maxPlayers: integer("maxPlayers").default(20).notNull(),
  status: text("status").default("offline").notNull(), // 'online' | 'offline' | 'starting' | 'stopping'
  version: text("version"),
  directory: text("directory"),
  javaArgs: text("javaArgs").default("-Xmx2G -Xms1G"),
  autoRestart: integer("autoRestart").default(0).notNull(), // 0 = off, 1 = on
  createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).defaultNow().notNull(),
});

export const worlds = sqliteTable("worlds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: integer("serverId").references(() => servers.id).notNull(),
  name: text("name").notNull(),
  size: text("size"),
  lastModified: integer("lastModified", { mode: "timestamp" }).defaultNow().notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
});

export const plugins = sqliteTable("plugins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: integer("serverId").references(() => servers.id).notNull(),
  name: text("name").notNull(),
  version: text("version"),
  enabled: integer("enabled").default(1).notNull(), // 0 for disabled, 1 for enabled
  createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
});

export const backups = sqliteTable("backups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: integer("serverId").references(() => servers.id).notNull(),
  worldName: text("worldName").notNull(),
  fileName: text("fileName").notNull(),
  fileSize: text("fileSize"),
  createdAt: integer("createdAt", { mode: "timestamp" }).defaultNow().notNull(),
});

export const performanceMetrics = sqliteTable("performance_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: integer("serverId").references(() => servers.id).notNull(),
  cpu: integer("cpu").notNull(),
  ram: integer("ram").notNull(),
  tps: integer("tps").notNull(),
  disk: integer("disk").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Server = typeof servers.$inferSelect;
export type InsertServer = typeof servers.$inferInsert;
export type World = typeof worlds.$inferSelect;
export type InsertWorld = typeof worlds.$inferInsert;
export type Plugin = typeof plugins.$inferSelect;
export type InsertPlugin = typeof plugins.$inferInsert;
export type Backup = typeof backups.$inferSelect;
export type InsertBackup = typeof backups.$inferInsert;
export type PerformanceMetric = typeof performanceMetrics.$inferSelect;
export type InsertPerformanceMetric = typeof performanceMetrics.$inferInsert;