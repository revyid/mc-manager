import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { hashPassword, verifyPassword } from "./_core/auth-utils";
import { sdk } from "./_core/sdk";
import { TRPCError } from "@trpc/server";
import { getVersionsByType, downloadServerJar, ServerType } from "./_core/minecraft";
import { startMinecraftServer, stopMinecraftServer, restartMinecraftServer, isServerRunning, sendCommand, getServerLogs, getLiveServerStats } from "./_core/runner";
import path from "node:path";
import fs from "node:fs";
import axios from "axios";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "User already exists",
          });
        }

        const hashedPassword = hashPassword(input.password);
        const user = await db.createUser({
          email: input.email,
          password: hashedPassword,
          name: input.name,
          loginMethod: "local",
        });

        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create user",
          });
        }

        // Auto login after registration
        const sessionToken = await sdk.createSessionToken(user.email!, {
          name: user.name || "",
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return user;
      }),
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await db.getUserByEmail(input.email);
        if (!user || !user.password) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        const isValid = verifyPassword(input.password, user.password);
        if (!isValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        const sessionToken = await sdk.createSessionToken(user.email!, {
          name: user.name || "",
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return user;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  servers: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const dbServers = await db.getServersByOwner(ctx.user.id);
      return dbServers.map(s => ({
        ...s,
        status: isServerRunning(s.id) ? "online" : (s.status === "online" ? "online" : "offline"),
      }));
    }),

    getAvailableVersions: protectedProcedure
      .input(z.object({ type: z.enum(["java", "bedrock", "fabric", "paper", "purpur", "spigot", "forge", "neoforge"]) }))
      .query(async ({ input }) => {
        return getVersionsByType(input.type as ServerType);
      }),

    status: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .query(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Server not found",
          });
        }
        const running = isServerRunning(input.serverId);
        return { status: running ? "online" : "offline", currentPlayers: 0 };
      }),

    getLogs: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .query(({ input }) => {
        return { logs: getServerLogs(input.serverId) };
      }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string(),
          type: z.enum(["java", "bedrock", "fabric", "paper", "purpur", "spigot", "forge", "neoforge"]),
          port: z.number(),
          maxPlayers: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const serverDir = path.join(process.cwd(), "instances", `${input.name.replace(/\s+/g, "_")}_${Date.now()}`);
        if (!fs.existsSync(serverDir)) fs.mkdirSync(serverDir, { recursive: true });
        return db.createServer({ ...input, ownerId: ctx.user.id, status: "offline", directory: serverDir });
      }),

    downloadJar: protectedProcedure
      .input(
        z.object({
          serverId: z.number(),
          version: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server || !server.directory) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
        }

        await db.updateServer(input.serverId, { version: input.version });
        
        try {
          await downloadServerJar(input.version, server.type as "java" | "bedrock", server.directory);
          return { success: true, message: "Server files downloaded successfully" };
        } catch (error) {
          console.error("Download failed:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Download failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }),

    start: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server || !server.directory) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
        }

        try {
          const javaArgs = server.javaArgs || "-Xmx2G -Xms1G";
          startMinecraftServer(input.serverId, server.directory, server.type as any, server.port, server.version || "latest", javaArgs);
          await db.updateServer(input.serverId, { status: "online" });
          return { success: true, message: "Server started" };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to start server",
          });
        }
      }),

    stop: protectedProcedure
      .input(z.object({ serverId: z.number(), force: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        stopMinecraftServer(input.serverId, !input.force);
        await db.updateServer(input.serverId, { status: "offline" });
        return { success: true, message: input.force ? "Server force stopped" : "Server stopping gracefully..." };
      }),

    restart: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server || !server.directory) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
        }

        const javaArgs = server.javaArgs || "-Xmx2G -Xms1G";
        await db.updateServer(input.serverId, { status: "online" });
        restartMinecraftServer(input.serverId, server.directory, server.type as any, server.port, server.version || "latest", javaArgs);
        return { success: true, message: "Server restarting gracefully (world saving)..." };
      }),

    rename: protectedProcedure
      .input(z.object({ serverId: z.number(), name: z.string().min(1).max(64) }))
      .mutation(async ({ input, ctx }) => {
        const server = await db.getServerById(input.serverId);
        if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
        if (server.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your server" });

        await db.updateServer(input.serverId, { name: input.name });
        return { success: true, message: "Server renamed" };
      }),

    delete: protectedProcedure
      .input(z.object({ serverId: z.number(), deleteFiles: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const server = await db.getServerById(input.serverId);
        if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
        if (server.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your server" });

        if (isServerRunning(input.serverId)) {
          stopMinecraftServer(input.serverId);
        }

        // Delete files from disk if requested
        if (input.deleteFiles && server.directory && fs.existsSync(server.directory)) {
          try {
            fs.rmSync(server.directory, { recursive: true, force: true });
          } catch (err) {
            console.error(`Failed to delete server directory: ${err}`);
          }
        }

        await db.deleteServer(input.serverId);
        return { success: true };
      }),

    getLiveStats: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .query(async ({ input }) => {
        return getLiveServerStats(input.serverId);
      }),

    executeCommand: protectedProcedure
      .input(
        z.object({
          serverId: z.number(),
          command: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          sendCommand(input.serverId, input.command);
          return { success: true, output: `Executed: ${input.command}` };
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Failed to send command",
          });
        }
      }),

    getProperties: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .query(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const propsPath = path.join(server.directory, "server.properties");
        if (!fs.existsSync(propsPath)) {
          const defaults: Record<string, string> = {
            "motd": "A Minecraft Server",
            "server-port": String(server.port),
            "max-players": String(server.maxPlayers),
            "online-mode": "true",
            "gamemode": "survival",
            "difficulty": "normal",
            "level-name": "world",
            "view-distance": "10",
            "spawn-protection": "16",
            "pvp": "true",
            "white-list": "false",
            "enable-command-block": "false",
            "allow-flight": "false",
            "level-seed": "",
            "generate-structures": "true",
            "enable-rcon": "false",
            "server-name": server.name,
          };
          return { properties: defaults, exists: false };
        }

        const content = fs.readFileSync(propsPath, "utf8");
        const properties: Record<string, string> = {};
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIndex = trimmed.indexOf("=");
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            const value = trimmed.substring(eqIndex + 1).trim();
            properties[key] = value;
          }
        }
        return { properties, exists: true };
      }),

    updateProperties: protectedProcedure
      .input(
        z.object({
          serverId: z.number(),
          properties: z.record(z.string(), z.string()),
        })
      )
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const propsPath = path.join(server.directory, "server.properties");
        let lines: string[] = [];
        let existingProps: Record<string, string> = {};

        if (fs.existsSync(propsPath)) {
          const content = fs.readFileSync(propsPath, "utf8");
          for (const line of content.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
              lines.push(line);
              continue;
            }
            const idx = trimmed.indexOf("=");
            if (idx > 0) {
              const key = trimmed.slice(0, idx).trim();
              existingProps[key] = trimmed.slice(idx + 1).trim();
            }
          }
        }

        // Merge new properties
        for (const [key, value] of Object.entries(input.properties)) {
          existingProps[key] = value;
        }

        // Write all properties
        const output = Object.entries(existingProps)
          .map(([key, value]) => `${key}=${value}`)
          .join("\n");

        // Add comments header
        const header = "#Minecraft server properties\n#Managed by MC Server Manager\n";
        fs.writeFileSync(propsPath, header + output + "\n", "utf8");

        return { success: true, message: "Properties saved. Restart server to apply." };
      }),

    updateJavaArgs: protectedProcedure
      .input(z.object({
        serverId: z.number(),
        javaArgs: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const server = await db.getServerById(input.serverId);
        if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
        if (server.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your server" });
        await db.updateServer(input.serverId, { javaArgs: input.javaArgs });
        return { success: true, message: "JVM args saved. Restart server to apply." };
      }),

    toggleAutoRestart: protectedProcedure
      .input(z.object({
        serverId: z.number(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        const server = await db.getServerById(input.serverId);
        if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
        if (server.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your server" });
        await db.updateServer(input.serverId, { autoRestart: input.enabled ? 1 : 0 });
        return { success: true };
      }),

    updateResourceLimits: protectedProcedure
      .input(z.object({
        serverId: z.number(),
        ramLimit: z.number().min(512).max(1048576), // 512MB to 1TB
        storageLimit: z.number().min(1024).max(10485760), // 1GB to 10TB
      }))
      .mutation(async ({ input, ctx }) => {
        const server = await db.getServerById(input.serverId);
        if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });
        if (server.ownerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your server" });
        await db.updateServer(input.serverId, { ramLimit: input.ramLimit, storageLimit: input.storageLimit });
        return { success: true, message: "Resource limits updated successfully." };
      }),
  }),

  players: router({
    list: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .query(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory || !server.port) return [];

        const opsPath = path.join(server.directory, "ops.json");
        const ops: string[] = [];
        if (fs.existsSync(opsPath)) {
          try {
            const opsData = JSON.parse(fs.readFileSync(opsPath, "utf8"));
            for (const op of opsData) ops.push(op.name || op.uuid);
          } catch {}
        }

        const bannedPath = path.join(server.directory, "banned-players.json");
        const banned: string[] = [];
        if (fs.existsSync(bannedPath)) {
          try {
            const bannedData = JSON.parse(fs.readFileSync(bannedPath, "utf8"));
            for (const ban of bannedData) banned.push(ban.name || ban.uuid);
          } catch {}
        }

        // Only get actually online players via ping
        const results: { id: string; username: string; uuid: string; joinTime: string; isOp: boolean; isBanned: boolean }[] = [];
        try {
          const { JavaPingClient, BedrockPingClient } = await import("craftping");
          let pingResult: any;
          if (server.type === "bedrock") {
            const bp = new BedrockPingClient();
            pingResult = await bp.ping("localhost", server.port, AbortSignal.timeout(3000));
          } else {
            const jp = new JavaPingClient();
            pingResult = await jp.ping("localhost", server.port, { signal: AbortSignal.timeout(3000) });
          }
          const onlinePlayers = pingResult?.players?.sample || pingResult?.samplePlayers || [];
          for (const p of onlinePlayers) {
            const name = p.name || p;
            results.push({
              id: p.id || name,
              username: name,
              uuid: p.id || "",
              joinTime: new Date().toISOString(),
              isOp: ops.includes(name),
              isBanned: banned.includes(name),
            });
          }
        } catch {}

        return results;
      }),

    kick: protectedProcedure
      .input(z.object({ serverId: z.number(), username: z.string() }))
      .mutation(async ({ input }) => {
        if (isServerRunning(input.serverId)) {
          sendCommand(input.serverId, `kick ${input.username}`);
        }
        return { success: true };
      }),

    ban: protectedProcedure
      .input(z.object({ serverId: z.number(), username: z.string() }))
      .mutation(async ({ input }) => {
        if (isServerRunning(input.serverId)) {
          sendCommand(input.serverId, `ban ${input.username}`);
        }
        return { success: true };
      }),

    unban: protectedProcedure
      .input(z.object({ serverId: z.number(), username: z.string() }))
      .mutation(async ({ input }) => {
        if (isServerRunning(input.serverId)) {
          sendCommand(input.serverId, `pardon ${input.username}`);
        }
        return { success: true };
      }),

    op: protectedProcedure
      .input(z.object({ serverId: z.number(), username: z.string() }))
      .mutation(async ({ input }) => {
        if (isServerRunning(input.serverId)) {
          sendCommand(input.serverId, `op ${input.username}`);
        }
        return { success: true };
      }),

    deop: protectedProcedure
      .input(z.object({ serverId: z.number(), username: z.string() }))
      .mutation(async ({ input }) => {
        if (isServerRunning(input.serverId)) {
          sendCommand(input.serverId, `deop ${input.username}`);
        }
        return { success: true };
      }),
  }),

  worlds: router({
    list: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .query(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) return [];

        const worlds: { id: number; name: string; size: string; lastModified: string; createdAt: string }[] = [];
        const dir = server.directory;

        if (!fs.existsSync(dir)) return [];

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        let worldId = 1;
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const fullPath = path.join(dir, entry.name);

          // Check if it's a world folder (contains level.dat)
          if (fs.existsSync(path.join(fullPath, "level.dat"))) {
            let totalSize = 0;
            try {
              const stat = fs.statSync(fullPath);
              totalSize = stat.size;
            } catch {}

            let lastModified = new Date().toISOString();
            try {
              const stat = fs.statSync(path.join(fullPath, "level.dat"));
              lastModified = stat.mtime.toISOString();
            } catch {}

            worlds.push({
              id: worldId++,
              name: entry.name,
              size: `${(totalSize / (1024 * 1024)).toFixed(1)} MB`,
              lastModified,
              createdAt: lastModified,
            });
          }
        }

        return worlds;
      }),

    listBackups: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .query(async ({ input }) => {
        return db.getBackupsByServerId(input.serverId);
      }),

    save: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .mutation(async ({ input }) => {
        return { success: true };
      }),

    backup: protectedProcedure
      .input(z.object({ serverId: z.number(), worldName: z.string() }))
      .mutation(async ({ input }) => {
        const backup = await db.createBackup({
          serverId: input.serverId,
          worldName: input.worldName,
          fileName: `${input.worldName}-${Date.now()}.zip`,
          fileSize: "0 MB",
        });
        return { success: true, backupId: backup[0]?.id };
      }),

    restore: protectedProcedure
      .input(z.object({ serverId: z.number(), backupId: z.number() }))
      .mutation(async ({ input }) => {
        return { success: true };
      }),

    deleteBackup: protectedProcedure
      .input(z.object({ backupId: z.number() }))
      .mutation(async ({ input }) => {
        return { success: true };
      }),
  }),

  plugins: router({
    list: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .query(async ({ input }) => {
        return db.getPluginsByServerId(input.serverId);
      }),

    toggle: protectedProcedure
      .input(z.object({ pluginId: z.number(), enabled: z.boolean(), serverId: z.number().optional() }))
      .mutation(async ({ input }) => {
        const plugin = await db.getPluginById(input.pluginId);
        if (!plugin) throw new TRPCError({ code: "NOT_FOUND", message: "Plugin not found" });

        await db.updatePlugin(input.pluginId, { enabled: input.enabled ? 1 : 0 });

        // Rename file on disk to disable/enable
        const serverId = input.serverId || plugin.serverId;
        const server = await db.getServerById(serverId);
        if (server?.directory) {
          const isBedrock = server.type === "bedrock";
          const isMod = server.type === "fabric" || server.type === "forge" || server.type === "neoforge";
          const subDirs = isBedrock
            ? ["development_behavior_packs", "behavior_packs", "development_resource_packs", "resource_packs"]
            : isMod
              ? ["mods"]
              : ["plugins"];

          for (const subDir of subDirs) {
            const dir = path.join(server.directory, subDir);
            if (!fs.existsSync(dir)) continue;

            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
              const baseName = entry.replace(/\.disabled$/, "");
              if (baseName === plugin.name || baseName.startsWith(plugin.name + ".")) {
                const oldPath = path.join(dir, entry);
                const newPath = input.enabled
                  ? path.join(dir, baseName)
                  : path.join(dir, entry + ".disabled");

                if (oldPath !== newPath && fs.existsSync(oldPath)) {
                  try { fs.renameSync(oldPath, newPath); } catch {}
                }
                break;
              }
            }
          }
        }

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ pluginId: z.number() }))
      .mutation(async ({ input }) => {
        const plugin = await db.getPluginById(input.pluginId);
        if (!plugin) throw new TRPCError({ code: "NOT_FOUND", message: "Plugin not found" });

        const server = await db.getServerById(plugin.serverId);
        if (server?.directory) {
          const isBedrock = server.type === "bedrock";
          const isMod = server.type === "fabric" || server.type === "forge" || server.type === "neoforge";
          const subDirs = isBedrock
            ? ["development_behavior_packs", "behavior_packs", "development_resource_packs", "resource_packs"]
            : isMod
              ? ["mods"]
              : ["plugins"];

          for (const subDir of subDirs) {
            const dir = path.join(server.directory, subDir);
            if (!fs.existsSync(dir)) continue;

            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
              const baseName = entry.replace(/\.disabled$/, "");
              if (baseName === plugin.name || baseName.startsWith(plugin.name + ".")) {
                try { fs.unlinkSync(path.join(dir, entry)); } catch {}
              }
            }
          }
        }

        await db.deletePlugin(input.pluginId);
        return { success: true };
      }),

    upload: protectedProcedure
      .input(
        z.object({
          serverId: z.number(),
          filename: z.string(),
          fileData: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        await db.createPlugin({
          serverId: input.serverId,
          name: input.filename,
          version: "1.0.0",
          enabled: 1,
        });
        return { success: true, message: "File uploaded" };
      }),

    searchOnline: protectedProcedure
      .input(z.object({
        query: z.string().optional(),
        mcVersion: z.string().optional(),
        loader: z.string().optional(),
        pluginType: z.enum(["plugin", "mod"]).default("plugin"),
        platform: z.enum(["spigot", "modrinth", "curseforge"]).default("modrinth"),
      }))
      .query(async ({ input }) => {
        try {
          if (input.platform === "modrinth") {
            const facets: string[][] = [];
            if (input.mcVersion) facets.push([`versions:${input.mcVersion}`]);
            if (input.pluginType === "plugin") {
              facets.push(["project_type:plugin"]);
            } else {
              facets.push(["project_type:mod"]);
            }
            if (input.loader) {
              facets.push([`categories:${input.loader}`]);
            }

            const params = new URLSearchParams();
            if (input.query) params.set("query", input.query);
            params.set("facets", JSON.stringify(facets));
            params.set("limit", "20");
            params.set("index", "relevance");

            const { data } = await axios.get(`https://api.modrinth.com/v2/search?${params}`);
            return (data.hits || []).map((hit: any) => ({
              id: hit.slug || hit.project_id,
              name: hit.title,
              description: hit.description,
              downloads: hit.downloads,
              icon: hit.icon_url,
              author: hit.author,
              versions: hit.versions,
              source: "modrinth" as const,
              projectUrl: `https://modrinth.com/${input.pluginType === "mod" ? "mod" : "plugin"}/${hit.slug}`,
              downloadUrl: null,
              compatible: input.mcVersion ? hit.versions?.includes(input.mcVersion) : true,
            }));
          }

          if (input.platform === "spigot") {
            const { data } = await axios.get(
              `https://api.spiget.org/v2/search/resources/${encodeURIComponent(input.query || "")}?size=20&sort=-downloads&field=name`
            );
            return (data || []).map((item: any) => ({
              id: String(item.id),
              name: item.name,
              description: item.tagLine || "",
              downloads: item.downloads,
              icon: item.icon?.url ? `https://api.spiget.org/v2/resources/${item.id}/icon` : null,
              author: item.author?.name || "",
              versions: [],
              source: "spigot" as const,
              projectUrl: `https://www.spigotmc.org/resources/${item.id}`,
              downloadUrl: null,
            }));
          }

          return [];
        } catch (err) {
          console.error("Search error:", err);
          return [];
        }
      }),

    downloadOnline: protectedProcedure
      .input(z.object({
        serverId: z.number(),
        downloadUrl: z.string().optional(),
        projectSlug: z.string().optional(),
        fileName: z.string().optional(),
        versionId: z.string().optional(),
        source: z.enum(["modrinth", "spigot", "curseforge"]),
      }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        let downloadUrl = input.downloadUrl;
        let fileName = input.fileName;

        if (!downloadUrl && input.projectSlug && input.source === "modrinth") {
          const versionParams = new URLSearchParams();
          if (server.version) versionParams.set("game_versions", `["${server.version}"]`);
          const isMod = server.type === "fabric" || server.type === "forge" || server.type === "neoforge";
          if (isMod && server.type) versionParams.set("loaders", `["${server.type}"]`);

          const versionsUrl = `https://api.modrinth.com/v2/project/${input.projectSlug}/version${versionParams.toString() ? `?${versionParams.toString()}` : ""}`;
          const versionsRes = await axios.get(versionsUrl);
          const versions = versionsRes.data;

          if (!versions || versions.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `No compatible version found for MC ${server.version || "unknown"} (${server.type}). Try a different mod or check modrinth.com for compatible versions.`,
            });
          }

          const latest = versions[0];
          const file = latest.files.find((f: any) => f.primary) || latest.files[0];
          if (!file) throw new TRPCError({ code: "BAD_REQUEST", message: "No downloadable file" });
          downloadUrl = file.url;
          fileName = file.filename;
        }

        if (!downloadUrl || !fileName) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing download info" });

        const isMod = server.type === "forge" || server.type === "fabric" || server.type === "neoforge";
        const isBedrock = server.type === "bedrock";
        let targetDir: string;
        if (isBedrock) {
          targetDir = path.join(server.directory, "development_resource_packs");
        } else if (isMod) {
          targetDir = path.join(server.directory, "mods");
        } else {
          targetDir = path.join(server.directory, "plugins");
        }

        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const targetPath = path.join(targetDir, fileName);

        try {
          const response = await axios({ url: downloadUrl, method: "GET", responseType: "stream" });
          const { pipeline } = await import("node:stream/promises");
          await pipeline(response.data, fs.createWriteStream(targetPath));

          await db.createPlugin({
            serverId: input.serverId,
            name: fileName.replace(/\.(jar|zip|mcaddon|mcpack)$/, ""),
            version: "latest",
            enabled: 1,
          });

          return { success: true, message: `${fileName} installed` };
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }),

    listModVersions: protectedProcedure
      .input(z.object({
        projectSlug: z.string(),
        gameVersion: z.string().optional(),
        loader: z.string().optional(),
      }))
      .query(async ({ input }) => {
        try {
          const params = new URLSearchParams();
          if (input.gameVersion) params.set("game_versions", `["${input.gameVersion}"]`);
          if (input.loader) params.set("loaders", `["${input.loader}"]`);

          const { data: versions } = await axios.get(
            `https://api.modrinth.com/v2/project/${input.projectSlug}/version${params.toString() ? `?${params.toString()}` : ""}`
          );

          return (versions || []).map((v: any) => ({
            id: v.version_number,
            name: v.name,
            versionNumber: v.version_number,
            gameVersions: v.game_versions,
            loaders: v.loaders,
            datePublished: v.date_published,
            downloads: v.downloads,
            files: (v.files || []).map((f: any) => ({
              filename: f.filename,
              url: f.url,
              size: f.size,
              primary: f.primary,
            })),
          }));
        } catch {
          return [];
        }
      }),

    // Bedrock addon management
    listAddons: protectedProcedure
      .input(z.object({ serverId: z.number() }))
      .query(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const addons: { name: string; type: string; path: string; enabled: boolean }[] = [];

        // Check behavior packs
        const bpDirs = ["development_behavior_packs", "behavior_packs"];
        for (const dir of bpDirs) {
          const bpPath = path.join(server.directory, dir);
          if (fs.existsSync(bpPath)) {
            for (const entry of fs.readdirSync(bpPath, { withFileTypes: true })) {
              if (entry.isDirectory()) {
                addons.push({ name: entry.name, type: "behavior", path: `${dir}/${entry.name}`, enabled: dir === "behavior_packs" });
              }
            }
          }
        }

        // Check resource packs
        const rpDirs = ["development_resource_packs", "resource_packs"];
        for (const dir of rpDirs) {
          const rpPath = path.join(server.directory, dir);
          if (fs.existsSync(rpPath)) {
            for (const entry of fs.readdirSync(rpPath, { withFileTypes: true })) {
              if (entry.isDirectory()) {
                addons.push({ name: entry.name, type: "resource", path: `${dir}/${entry.name}`, enabled: dir === "resource_packs" });
              }
            }
          }
        }

        return addons;
      }),

    uploadAddon: protectedProcedure
      .input(z.object({
        serverId: z.number(),
        fileName: z.string(),
        fileData: z.string(),
        addonType: z.enum(["behavior", "resource"]),
      }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const targetDir = input.addonType === "behavior"
          ? path.join(server.directory, "development_behavior_packs")
          : path.join(server.directory, "development_resource_packs");

        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const base64 = input.fileData.includes(",") ? input.fileData.split(",")[1] : input.fileData;
        const buffer = Buffer.from(base64, "base64");
        const targetPath = path.join(targetDir, input.fileName);
        fs.writeFileSync(targetPath, buffer);

        return { success: true, message: `${input.addonType} pack uploaded` };
      }),

    toggleAddon: protectedProcedure
      .input(z.object({ serverId: z.number(), addonPath: z.string(), enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const parts = input.addonPath.split("/");
        if (parts.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid path" });

        const addonName = parts.pop()!;
        const fromDir = path.join(server.directory, ...parts);

        let toDirName: string;
        const currentType = parts[parts.length - 1].includes("behavior") ? "behavior" : "resource";

        if (input.enabled) {
          toDirName = currentType === "behavior" ? "behavior_packs" : "resource_packs";
        } else {
          toDirName = currentType === "behavior" ? "development_behavior_packs" : "development_resource_packs";
        }

        const toDir = path.join(server.directory, toDirName);
        if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });

        fs.renameSync(path.join(fromDir, addonName), path.join(toDir, addonName));
        return { success: true };
      }),
  }),

  performance: router({
    getMetrics: protectedProcedure
      .input(z.object({ serverId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return db.getMetricsByServerId(input.serverId, input.limit ?? 60);
      }),
  }),

  files: router({
    list: protectedProcedure
      .input(z.object({ serverId: z.number(), subpath: z.string().optional() }))
      .query(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const base = server.directory;
        const target = input.subpath
          ? path.resolve(base, input.subpath)
          : base;

        // Security: prevent directory traversal
        if (!target.startsWith(base)) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        if (!fs.existsSync(target)) throw new TRPCError({ code: "NOT_FOUND", message: "Path not found" });

        const entries = fs.readdirSync(target, { withFileTypes: true });
        return entries.map((e) => {
          const fullPath = path.join(target, e.name);
          const stat = fs.statSync(fullPath);
          return {
            name: e.name,
            isDirectory: e.isDirectory(),
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            ext: e.isDirectory() ? "" : path.extname(e.name).toLowerCase(),
          };
        }).sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      }),

    read: protectedProcedure
      .input(z.object({ serverId: z.number(), subpath: z.string() }))
      .query(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const target = path.resolve(server.directory, input.subpath);
        if (!target.startsWith(server.directory)) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        if (!fs.existsSync(target)) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });

        const stat = fs.statSync(target);
        if (stat.size > 2 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (>2MB)" });

        return { content: fs.readFileSync(target, "utf8"), size: stat.size };
      }),

    write: protectedProcedure
      .input(z.object({ serverId: z.number(), subpath: z.string(), content: z.string() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const target = path.resolve(server.directory, input.subpath);
        if (!target.startsWith(server.directory)) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

        fs.writeFileSync(target, input.content, "utf8");
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ serverId: z.number(), subpath: z.string() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const target = path.resolve(server.directory, input.subpath);
        if (!target.startsWith(server.directory)) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        if (!fs.existsSync(target)) throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });

        const stat = fs.statSync(target);
        if (stat.isDirectory()) {
          fs.rmSync(target, { recursive: true });
        } else {
          fs.unlinkSync(target);
        }
        return { success: true };
      }),

    rename: protectedProcedure
      .input(z.object({ serverId: z.number(), subpath: z.string(), newName: z.string() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const target = path.resolve(server.directory, input.subpath);
        const newTarget = path.join(path.dirname(target), input.newName);
        if (!target.startsWith(server.directory) || !newTarget.startsWith(server.directory))
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

        fs.renameSync(target, newTarget);
        return { success: true };
      }),

    mkdir: protectedProcedure
      .input(z.object({ serverId: z.number(), subpath: z.string() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const target = path.resolve(server.directory, input.subpath);
        if (!target.startsWith(server.directory)) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

        fs.mkdirSync(target, { recursive: true });
        return { success: true };
      }),

    upload: protectedProcedure
      .input(z.object({ serverId: z.number(), subpath: z.string(), fileName: z.string(), fileData: z.string() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const target = path.resolve(server.directory, input.subpath, input.fileName);
        if (!target.startsWith(server.directory)) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

        // fileData is base64 encoded
        const base64 = input.fileData.includes(",") ? input.fileData.split(",")[1] : input.fileData;
        const buffer = Buffer.from(base64, "base64");

        const dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, buffer);
        return { success: true, message: "File uploaded" };
      }),

    info: protectedProcedure
      .input(z.object({ serverId: z.number(), subpath: z.string() }))
      .query(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const target = path.resolve(server.directory, input.subpath);
        if (!target.startsWith(server.directory)) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        if (!fs.existsSync(target)) throw new TRPCError({ code: "NOT_FOUND", message: "Path not found" });

        const stat = fs.statSync(target);
        const isDir = stat.isDirectory();

        let totalSize = isDir ? 0 : stat.size;
        let fileCount = 0;
        let dirCount = 0;

        if (isDir) {
          try {
            const scan = (dir: string, depth: number) => {
              if (depth > 5) return;
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                const full = path.join(dir, e.name);
                try {
                  if (e.isDirectory()) {
                    dirCount++;
                    scan(full, depth + 1);
                  } else {
                    fileCount++;
                    totalSize += fs.statSync(full).size;
                  }
                } catch {}
              }
            };
            scan(target, 0);
          } catch {}
        }

        return {
          name: path.basename(target),
          path: input.subpath,
          isDirectory: isDir,
          size: totalSize,
          fileCount,
          dirCount,
          modifiedAt: stat.mtime.toISOString(),
          createdAt: stat.birthtime.toISOString(),
          ext: isDir ? "" : path.extname(target).toLowerCase(),
          permissions: stat.mode.toString(8).slice(-3),
        };
      }),

    move: protectedProcedure
      .input(z.object({ serverId: z.number(), fromPath: z.string(), toPath: z.string() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const from = path.resolve(server.directory, input.fromPath);
        const to = path.resolve(server.directory, input.toPath);
        if (!from.startsWith(server.directory) || !to.startsWith(server.directory))
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

        fs.renameSync(from, to);
        return { success: true };
      }),

    copy: protectedProcedure
      .input(z.object({ serverId: z.number(), fromPath: z.string(), toPath: z.string() }))
      .mutation(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const from = path.resolve(server.directory, input.fromPath);
        const to = path.resolve(server.directory, input.toPath);
        if (!from.startsWith(server.directory) || !to.startsWith(server.directory))
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });

        const stat = fs.statSync(from);
        if (stat.isDirectory()) {
          fs.cpSync(from, to, { recursive: true });
        } else {
          fs.copyFileSync(from, to);
        }
        return { success: true };
      }),

    download: protectedProcedure
      .input(z.object({ serverId: z.number(), subpath: z.string() }))
      .query(async ({ input }) => {
        const server = await db.getServerById(input.serverId);
        if (!server?.directory) throw new TRPCError({ code: "NOT_FOUND", message: "Server not found" });

        const target = path.resolve(server.directory, input.subpath);
        if (!target.startsWith(server.directory)) throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        if (!fs.existsSync(target)) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });

        const stat = fs.statSync(target);
        if (stat.isDirectory()) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot download directory" });
        if (stat.size > 50 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (>50MB)" });

        const buffer = fs.readFileSync(target);
        return {
          content: buffer.toString("base64"),
          filename: path.basename(target),
          size: stat.size,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
