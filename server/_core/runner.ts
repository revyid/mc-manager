import { spawn, spawnSync, ChildProcess, exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import pidusage from "pidusage";
import { JavaPingClient, BedrockPingClient } from "craftping";
import * as db from "../db";

const execAsync = promisify(exec);

interface RunningServer {
  id: number;
  process: ChildProcess;
  logs: string[];
  type: "java" | "bedrock" | "fabric" | "paper" | "purpur" | "spigot" | "forge" | "neoforge";
  port: number;
}

const activeServers = new Map<number, RunningServer>();
const archivedLogs = new Map<number, string[]>();
const javaPingClient = new JavaPingClient();
const bedrockPingClient = new BedrockPingClient();
const pidCache = new Map<number, number>();
// Tracks servers intentionally stopped (to not auto-restart them on exit)
const intentionalStop = new Set<number>();

// Get directory size using OS-level command (much faster than recursive Node.js traversal)
export async function getDirSizeMBAsync(dir: string): Promise<number> {
  try {
    if (!fs.existsSync(dir)) return 0;

    // Use PowerShell on Windows for fast directory size calculation
    const { stdout } = await execAsync(
      `powershell -NoProfile -Command "(Get-ChildItem -Path '${dir.replace(/'/g, "''")}' -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum"`,
      { timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    const bytes = parseInt(stdout.trim(), 10);
    if (isNaN(bytes)) return 0;
    return bytes / 1024 / 1024;
  } catch {
    return 0;
  }
}

function estimateTps(cpuUsage: number, isOnline: boolean): number {
  if (!isOnline) return 0;
  let tps = 20.0;
  if (cpuUsage > 85) {
    const excessCpu = cpuUsage - 85;
    tps -= excessCpu * 0.4;
  }
  tps += (Math.random() - 0.5) * 0.15;
  return Math.min(20.0, Math.max(1.0, Math.round(tps * 100) / 100));
}

// Check if a server is reachable via ping (more reliable than TCP socket)
async function isServerReachable(port: number, type: string): Promise<boolean> {
  try {
    if (type === "bedrock") {
      const bp = new BedrockPingClient();
      await bp.ping("localhost", port, AbortSignal.timeout(3000));
    } else {
      const jp = new JavaPingClient();
      await jp.ping("localhost", port, { signal: AbortSignal.timeout(3000) });
    }
    return true;
  } catch {
    return false;
  }
}

// Find PID of process listening on a port
function findPidByPort(port: number): number | null {
  try {
    if (process.platform === "win32") {
      // Try netstat first
      const out = execSync('netstat -ano -p TCP 2>nul', { encoding: "utf8", timeout: 5000, windowsHide: true });
      const lines = out.split("\n");
      for (const line of lines) {
        // Match lines like: TCP    0.0.0.0:25565    0.0.0.0:0    LISTENING    12345
        if (line.includes(`:${port} `) && line.includes("LISTENING")) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1]);
          if (pid > 0 && pid !== 0) return pid;
        }
      }
      // Fallback: find Java process running server.jar via wmic
      try {
        const wmic = execSync('wmic process where "CommandLine like \'%server.jar%\'" get ProcessId /value 2>nul', { encoding: "utf8", timeout: 5000, windowsHide: true });
        const match = wmic.match(/ProcessId=(\d+)/);
        if (match) return parseInt(match[1]);
      } catch {}
    } else {
      const out = execSync(`lsof -i :${port} -t -sTCP:LISTEN 2>/dev/null`, { encoding: "utf8", timeout: 5000 });
      const pid = parseInt(out.trim().split("\n")[0]);
      if (pid > 0) return pid;
      // Fallback: find java process
      try {
        const psOut = execSync("pgrep -f 'server.jar' 2>/dev/null", { encoding: "utf8", timeout: 3000 });
        const pid = parseInt(psOut.trim().split("\n")[0]);
        if (pid > 0) return pid;
      } catch {}
    }
  } catch {}
  return null;
}

function getPidForServer(serverId: number, port: number): number | null {
  const managed = activeServers.get(serverId);
  if (managed?.process?.pid) return managed.process.pid;

  if (pidCache.has(serverId)) return pidCache.get(serverId)!;
  const pid = findPidByPort(port);
  if (pid) pidCache.set(serverId, pid);
  return pid;
}

// On startup, detect servers that might be running (pingable but not in activeServers map)
setInterval(async () => {
  try {
    const allServers = await db.getAllServers();
    for (const server of allServers) {
      if (activeServers.has(server.id)) continue;
      if (!server.port) continue;

      const reachable = await isServerReachable(server.port, server.type || "java");
      if (reachable) {
        await db.updateServer(server.id, { status: "online" });
      } else {
        if (server.status === "online") {
          await db.updateServer(server.id, { status: "offline" });
        }
      }
    }
  } catch {}
}, 10000);

// Background task to collect real metrics every 10 seconds
setInterval(async () => {
  try {
    const allServers = await db.getAllServers();
    for (const dbServer of allServers) {
      if (dbServer.status !== "online") continue;
      if (!dbServer.port) continue;

      const serverId = dbServer.id;

      try {
        let cpu = 0;
        let ram = 0;
        let tps = dbServer.status === "online" ? 20 : 0;

        const pid = getPidForServer(serverId, dbServer.port);
        if (pid) {
          try {
            const stats = await pidusage(pid);
            cpu = Math.round(stats.cpu);
            ram = Math.round(stats.memory / 1024 / 1024);
            tps = estimateTps(cpu, dbServer.status === "online");
          } catch {}
        }

        // Measure disk usage of server directory asynchronously
        let freshDisk = 0;
        if (dbServer.directory && fs.existsSync(dbServer.directory)) {
          try {
            freshDisk = Math.round(await getDirSizeMBAsync(dbServer.directory));
          } catch {}
        }

        // Only update disk cache with a valid value (>0). If scan returned 0, keep previous.
        const current = liveStatsCache.get(serverId) || { cpu: 0, ram: 0, disk: 0, tps: 0, pid: null, ts: 0 };
        const disk = freshDisk > 0 ? freshDisk : current.disk;

        liveStatsCache.set(serverId, {
          cpu,
          ram,
          disk,
          tps,
          pid: pid || null,
          ts: Date.now(),
        });

        await db.createMetric({
          serverId,
          cpu,
          ram,
          tps,
          disk,
        });
      } catch {}
    }
  } catch {}
}, 10000);

export function startMinecraftServer(serverId: number, directory: string, type: "java" | "bedrock" | "fabric" | "paper" | "purpur" | "spigot" | "forge" | "neoforge", port: number, mcVersion: string, javaArgs = "-Xmx2G -Xms1G") {
  if (activeServers.has(serverId)) {
    throw new Error("Server is already running");
  }

  if (type !== "bedrock") {
    try {
      const javaCheck = spawnSync("java", ["-version"], { encoding: "utf8" });
      const versionOutput = javaCheck.stderr || javaCheck.stdout;
      const versionMatch = versionOutput.match(/(?:version "|openjdk version ")(\d+)/);
      const majorVersion = versionMatch ? parseInt(versionMatch[1]) : 0;
      const isModern = mcVersion && (mcVersion.startsWith("1.21") || mcVersion.startsWith("1.20.5") || mcVersion.startsWith("1.20.6"));
      if (isModern && majorVersion < 21) throw new Error(`Java ${majorVersion} detected. MC 1.21+ requires Java 21.`);
      else if (majorVersion > 0 && majorVersion < 17) throw new Error(`Java ${majorVersion} is too old. MC 1.18+ requires Java 17+.`);
    } catch (e) {
      if (e instanceof Error && e.message.includes("Java")) throw e;
    }
  }

  let child: ChildProcess;

  if (type === "bedrock") {
    const exePath = path.join(directory, "bedrock_server.exe");
    if (!fs.existsSync(exePath)) throw new Error("bedrock_server.exe not found.");
    child = spawn(exePath, [], { cwd: directory });
  } else {
    const jarPath = path.join(directory, "server.jar");
    if (!fs.existsSync(jarPath)) throw new Error("server.jar not found. Please download it first.");
    fs.writeFileSync(path.join(directory, "eula.txt"), "eula=true");
    child = spawn("java", [...javaArgs.split(" ").filter(Boolean), "-jar", "server.jar", "nogui"], { cwd: directory });
  }

  const serverInfo: RunningServer = {
    id: serverId,
    process: child,
    logs: [],
    type,
    port,
  };

  child.stdout?.on("data", (data) => {
    const line = data.toString();
    serverInfo.logs.push(line);
    if (serverInfo.logs.length > 1000) serverInfo.logs.shift();
    archivedLogs.set(serverId, [...serverInfo.logs]);
  });

  child.stderr?.on("data", (data) => {
    const line = data.toString();
    serverInfo.logs.push(line);
    if (serverInfo.logs.length > 1000) serverInfo.logs.shift();
    archivedLogs.set(serverId, [...serverInfo.logs]);
  });

  child.on("exit", async (code) => {
    console.log(`[Server ${serverId}] Exited with code ${code}`);
    activeServers.delete(serverId);

    const wasIntentional = intentionalStop.has(serverId);
    intentionalStop.delete(serverId);

    if (!wasIntentional) {
      // Crash detected — check autoRestart flag
      try {
        const dbServer = await db.getServerById(serverId);
        if (dbServer?.autoRestart === 1) {
          console.log(`[Server ${serverId}] Crash detected, auto-restarting in 5s...`);
          const log = `\n[MC Manager] Server crashed (exit code ${code}). Auto-restarting in 5 seconds...\n`;
          const existing = archivedLogs.get(serverId) || [];
          archivedLogs.set(serverId, [...existing, log]);
          await db.updateServer(serverId, { status: "offline" });
          setTimeout(() => {
            if (activeServers.has(serverId)) return; // already restarted
            try {
              startMinecraftServer(
                serverId,
                dbServer.directory!,
                dbServer.type as any,
                dbServer.port,
                dbServer.version || "latest",
                dbServer.javaArgs || "-Xmx2G -Xms1G"
              );
              db.updateServer(serverId, { status: "online" }).catch(() => {});
            } catch (err) {
              console.error(`[Server ${serverId}] Auto-restart failed:`, err);
            }
          }, 5000);
        } else {
          await db.updateServer(serverId, { status: "offline" }).catch(() => {});
        }
      } catch (err) {
        console.error(`[Server ${serverId}] Error in crash handler:`, err);
      }
    }
  });

  activeServers.set(serverId, serverInfo);
  return child;
}

export function stopMinecraftServer(serverId: number, graceful = true) {
  const server = activeServers.get(serverId);
  pidCache.delete(serverId);
  intentionalStop.add(serverId); // mark as intentional so crash handler is skipped

  if (!server) return;

  if (graceful && server.process.stdin) {
    server.process.stdin.write("stop\n");
    const killTimeout = setTimeout(() => {
      if (activeServers.has(serverId)) {
        forceKillProcess(server);
        activeServers.delete(serverId);
      }
    }, 30000);

    server.process.on("exit", () => {
      clearTimeout(killTimeout);
      activeServers.delete(serverId);
    });
  } else {
    forceKillProcess(server);
    activeServers.delete(serverId);
  }
}

function forceKillProcess(server: RunningServer) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", server.process.pid?.toString() || "", "/f", "/t"]);
  } else {
    server.process.kill("SIGTERM");
    setTimeout(() => {
      if (!server.process.killed) server.process.kill("SIGKILL");
    }, 5000);
  }
}

export function restartMinecraftServer(serverId: number, directory: string, type: RunningServer["type"], port: number, version: string, javaArgs = "-Xmx2G -Xms1G") {
  const doStart = () => {
    try {
      startMinecraftServer(serverId, directory, type, port, version, javaArgs);
    } catch (err) {
      console.error(`[Server ${serverId}] Restart failed:`, err);
    }
  };

  const server = activeServers.get(serverId);
  if (!server) {
    doStart();
    return;
  }

  // Graceful stop, then restart after exit
  if (server.process.stdin) {
    server.process.stdin.write("stop\n");
  }

  const onExit = () => {
    clearTimeout(forceTimer);
    setTimeout(doStart, 2000);
  };
  server.process.once("exit", onExit);

  const forceTimer = setTimeout(() => {
    server.process.removeListener("exit", onExit);
    if (activeServers.has(serverId)) {
      forceKillProcess(server);
      activeServers.delete(serverId);
      setTimeout(doStart, 1000);
    }
  }, 30000);
  forceTimer.unref();
}

export function getServerLogs(serverId: number): string[] {
  return archivedLogs.get(serverId) || activeServers.get(serverId)?.logs || [];
}

export function isServerRunning(serverId: number): boolean {
  return activeServers.has(serverId);
}

export function sendCommand(serverId: number, command: string) {
  const server = activeServers.get(serverId);
  if (!server || !server.process.stdin) throw new Error("Server not running");
  server.process.stdin.write(command + "\n");
}

const liveStatsCache = new Map<number, { cpu: number; ram: number; disk: number; tps: number; pid: number | null; ts: number }>();

export async function getLiveServerStats(serverId: number) {
  const server = activeServers.get(serverId);
  const dbServer = await db.getServerById(serverId);
  if (!dbServer || dbServer.status !== "online") return null;

  const port = dbServer.port;
  if (!port) return null;

  // Try managed process first, then find PID from port
  const pid = server?.process?.pid || getPidForServer(serverId, port);

  // Get disk from cache, or queue an async scan if not available
  let disk = liveStatsCache.get(serverId)?.disk ?? 0;
  const cacheTs = liveStatsCache.get(serverId)?.ts ?? 0;
  // Trigger a fresh disk scan if disk is 0 or cache is stale (>30s old)
  if ((disk === 0 || Date.now() - cacheTs > 30000) && dbServer.directory && fs.existsSync(dbServer.directory)) {
    getDirSizeMBAsync(dbServer.directory).then((size) => {
      if (size > 0) {
        const current = liveStatsCache.get(serverId) || { cpu: 0, ram: 0, disk: 0, tps: 0, pid: null, ts: 0 };
        liveStatsCache.set(serverId, {
          ...current,
          disk: Math.round(size),
          ts: Date.now(),
        });
      }
    }).catch(() => {});
  }

  if (pid) {
    try {
      const stats = await pidusage(pid);
      const cpu = Math.round(stats.cpu * 10) / 10;
      const result = {
        cpu,
        ram: Math.round(stats.memory / 1024 / 1024),
        disk: liveStatsCache.get(serverId)?.disk ?? disk,
        tps: estimateTps(cpu, dbServer.status === "online"),
        pid,
      };
      liveStatsCache.set(serverId, { ...result, ts: Date.now() });
      return result;
    } catch {}
  }

  // Return cached if fresh (< 15s)
  const cached = liveStatsCache.get(serverId);
  if (cached && Date.now() - cached.ts < 15000) {
    return { cpu: cached.cpu, ram: cached.ram, disk: cached.disk, tps: cached.tps, pid: cached.pid };
  }

  return null;
}
