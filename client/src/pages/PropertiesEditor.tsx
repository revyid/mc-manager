import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, RefreshCw, Save, Info, Cpu, HardDrive } from "lucide-react";
import { toast } from "sonner";

const PROPERTY_META: Record<string, { type: "text" | "number" | "boolean" | "slider"; label: string; description?: string; min?: number; max?: number; category: string }> = {
  "motd": { type: "text", label: "MOTD", description: "Message of the day", category: "General" },
  "server-name": { type: "text", label: "Server Name", description: "Name shown in server list", category: "General" },
  "difficulty": { type: "text", label: "Difficulty", description: "peaceful · easy · normal · hard", category: "General" },
  "gamemode": { type: "text", label: "Game Mode", description: "survival · creative · adventure · spectator", category: "General" },
  "level-type": { type: "text", label: "Level Type", description: "minecraft:normal · flat · largebiomes · amplified", category: "General" },
  "log-ips": { type: "boolean", label: "Log IPs", category: "General" },
  "server-port": { type: "number", label: "Server Port", category: "Network" },
  "server-portv6": { type: "number", label: "Server Port (IPv6)", category: "Network" },
  "online-mode": { type: "boolean", label: "Online Mode", description: "Authenticate with Mojang/Microsoft servers", category: "Network" },
  "white-list": { type: "boolean", label: "Whitelist", description: "Only allow whitelisted players", category: "Network" },
  "enforce-whitelist": { type: "boolean", label: "Enforce Whitelist", description: "Kick non-whitelisted players on reload", category: "Network" },
  "prevent-proxy-connections": { type: "boolean", label: "Prevent Proxy Connections", category: "Network" },
  "rcon.port": { type: "number", label: "RCON Port", category: "Network" },
  "rcon.password": { type: "text", label: "RCON Password", category: "Network" },
  "query.port": { type: "number", label: "Query Port", category: "Network" },
  "max-players": { type: "slider", label: "Max Players", min: 1, max: 1000, category: "Players" },
  "pvp": { type: "boolean", label: "PvP", description: "Allow player vs player combat", category: "Players" },
  "spawn-protection": { type: "slider", label: "Spawn Protection Radius", min: 0, max: 100, category: "Players" },
  "player-idle-timeout": { type: "number", label: "Idle Timeout (min)", description: "0 = disabled", category: "Players" },
  "allow-nether": { type: "boolean", label: "Allow Nether", category: "World" },
  "level-name": { type: "text", label: "Level Name", description: "World folder name", category: "World" },
  "level-seed": { type: "text", label: "Level Seed", description: "Seed for world generation (blank = random)", category: "World" },
  "generator-settings": { type: "text", label: "Generator Settings", category: "World" },
  "view-distance": { type: "slider", label: "View Distance", min: 2, max: 64, category: "World" },
  "simulation-distance": { type: "slider", label: "Simulation Distance", min: 2, max: 64, category: "World" },
  "max-world-size": { type: "slider", label: "Max World Size (blocks)", min: 1000, max: 59999968, category: "World" },
  "generate-structures": { type: "boolean", label: "Generate Structures", category: "World" },
  "spawn-animals": { type: "boolean", label: "Spawn Animals", category: "World" },
  "spawn-monsters": { type: "boolean", label: "Spawn Monsters", category: "World" },
  "spawn-npcs": { type: "boolean", label: "Spawn NPCs", category: "World" },
  "max-tick-time": { type: "number", label: "Max Tick Time (ms)", description: "Watchdog timeout, -1 = disable", category: "Performance" },
  "network-compression-threshold": { type: "number", label: "Network Compression Threshold", category: "Performance" },
  "rate-limit": { type: "number", label: "Rate Limit", description: "Max packets/sec per player", category: "Performance" },
  "entity-broadcast-range-percentage": { type: "slider", label: "Entity Broadcast Range %", min: 10, max: 1000, category: "Performance" },
  "sync-chunk-writes": { type: "boolean", label: "Sync Chunk Writes", description: "Synchronous chunk writes (safer, slower)", category: "Performance" },
  "use-native-transport": { type: "boolean", label: "Native Transport", description: "Epoll Linux transport", category: "Performance" },
  "enable-command-block": { type: "boolean", label: "Command Blocks", category: "Features" },
  "allow-flight": { type: "boolean", label: "Allow Flight", description: "Allow flying in survival mode", category: "Features" },
  "enable-rcon": { type: "boolean", label: "RCON", description: "Remote console access", category: "Features" },
  "enable-query": { type: "boolean", label: "Query", description: "GameSpy4 query protocol", category: "Features" },
  "force-gamemode": { type: "boolean", label: "Force Gamemode", description: "Force default gamemode on join", category: "Features" },
  "hardcore": { type: "boolean", label: "Hardcore", description: "Banned on death, difficulty locked", category: "Features" },
  "hide-online-players": { type: "boolean", label: "Hide Online Players", description: "Prevent player list leaking", category: "Features" },
  "require-resource-pack": { type: "boolean", label: "Require Resource Pack", category: "Features" },
  "resource-pack": { type: "text", label: "Resource Pack URL", category: "Features" },
  "resource-pack-sha1": { type: "text", label: "Resource Pack SHA1", category: "Features" },
  "resource-pack-prompt": { type: "text", label: "Resource Pack Prompt", category: "Features" },
  "op-permission-level": { type: "slider", label: "OP Permission Level", min: 1, max: 4, category: "Features" },
  "function-permission-level": { type: "slider", label: "Function Permission Level", min: 1, max: 4, category: "Features" },
  "text-filtering-config": { type: "text", label: "Text Filtering Config", category: "Features" },
};

export default function PropertiesEditor({ serverId }: { serverId: number }) {
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // JVM args state
  const [xmx, setXmx] = useState(2048); // in MB
  const [xms, setXms] = useState(1024); // in MB
  const [jvmDirty, setJvmDirty] = useState(false);
  const [jvmSaving, setJvmSaving] = useState(false);
  const [autoRestart, setAutoRestart] = useState(false);

  // Resource Limits state
  const [ramLimit, setRamLimit] = useState(4096);
  const [storageLimit, setStorageLimit] = useState(10240);
  const [limitsDirty, setLimitsDirty] = useState(false);
  const [limitsSaving, setLimitsSaving] = useState(false);

  const utils = trpc.useUtils();

  const { data: serverInfo } = trpc.servers.list.useQuery(undefined, {
    select: (data) => data.find((s) => s.id === serverId),
  });

  const { data: sysInfo } = trpc.servers.getSystemInfo.useQuery(undefined, {
    staleTime: 60000, // cache 1 minute
  });

  // Derived real caps from device
  const systemRamMB = sysInfo?.totalRamMB ?? 0;
  const systemDiskMB = sysInfo?.totalDiskMB ?? 0;
  const freeDiskMB = sysInfo?.freeDiskMB ?? 0;
  const xmxMax = systemRamMB > 0 ? Math.min(systemRamMB, 65536) : 32768;
  const diskMax = systemDiskMB > 0 ? Math.min(systemDiskMB, 2 * 1024 * 1024) : 102400;

  const updateJavaArgsMutation = trpc.servers.updateJavaArgs.useMutation({
    onSuccess: () => { setJvmDirty(false); toast.success("JVM args saved! Restart server to apply."); },
    onError: (e) => toast.error(e.message || "Failed to save JVM args"),
  });

  const toggleAutoRestartMutation = trpc.servers.toggleAutoRestart.useMutation({
    onSuccess: (_, vars) => toast.success(`Auto-restart ${vars.enabled ? "enabled" : "disabled"}`),
    onError: (e) => toast.error(e.message || "Failed to update auto-restart"),
  });

  const updateResourceLimitsMutation = trpc.servers.updateResourceLimits.useMutation({
    onSuccess: () => {
      setLimitsDirty(false);
      toast.success("Resource limits saved!");
      utils.servers.list.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to save resource limits"),
  });

  // Parse javaArgs and resource limits from server info
  useEffect(() => {
    if (!serverInfo) return;
    let parsedXmx = xmx;
    if (serverInfo.javaArgs) {
      const xmxMatch = serverInfo.javaArgs.match(/-Xmx(\d+)([MmGg])/);
      const xmsMatch = serverInfo.javaArgs.match(/-Xms(\d+)([MmGg])/);
      if (xmxMatch) {
        const val = parseInt(xmxMatch[1]);
        parsedXmx = xmxMatch[2].toLowerCase() === "g" ? val * 1024 : val;
        setXmx(parsedXmx);
      }
      if (xmsMatch) {
        const val = parseInt(xmsMatch[1]);
        setXms(xmsMatch[2].toLowerCase() === "g" ? val * 1024 : val);
      }
    }
    setAutoRestart(serverInfo.autoRestart === 1);
    // ramLimit should always equal xmx for proper syncing
    const effectiveRamLimit = serverInfo.ramLimit && serverInfo.ramLimit !== 4096
      ? serverInfo.ramLimit
      : parsedXmx;
    setRamLimit(effectiveRamLimit);
    if (serverInfo.storageLimit !== undefined) {
      setStorageLimit(serverInfo.storageLimit);
    }
  }, [serverInfo?.javaArgs, serverInfo?.autoRestart, serverInfo?.ramLimit, serverInfo?.storageLimit]);

  // When system info loads, auto-set storageLimit from real disk if still at default
  useEffect(() => {
    if (!sysInfo || !systemDiskMB) return;
    setStorageLimit((prev) => {
      // Only auto-set if still at the hardcoded default (10240 = 10 GB)
      if (prev === 10240 && systemDiskMB > 0) return systemDiskMB;
      return prev;
    });
  }, [systemDiskMB]);

  const handleSaveLimits = () => {
    setLimitsSaving(true);
    updateResourceLimitsMutation.mutate(
      { serverId, ramLimit, storageLimit },
      { onSettled: () => setLimitsSaving(false) }
    );
  };

  const handleSaveJvm = () => {
    setJvmSaving(true);
    const args = `-Xmx${xmx}M -Xms${xms}M`;
    // Also sync ramLimit with xmx so the overview gauge matches
    if (xmx !== ramLimit) {
      setRamLimit(xmx);
      setLimitsDirty(true);
    }
    updateJavaArgsMutation.mutate(
      { serverId, javaArgs: args },
      {
        onSettled: () => setJvmSaving(false),
        onSuccess: () => {
          // Save resource limits too so ramLimit is persisted
          if (xmx !== ramLimit) {
            updateResourceLimitsMutation.mutate({ serverId, ramLimit: xmx, storageLimit });
          }
        },
      }
    );
  };

  const { data, isLoading, refetch } = trpc.servers.getProperties.useQuery(
    { serverId },
    { enabled: !!serverId }
  );

  const updateMutation = trpc.servers.updateProperties.useMutation({
    onSuccess: () => { setHasChanges(false); toast.success("Properties saved! Restart server to apply."); },
    onError: (e) => toast.error(e.message || "Failed to save"),
  });

  useEffect(() => {
    if (data && (data as any).properties) {
      setProperties((data as any).properties);
      setHasChanges(false);
    }
  }, [data]);

  const updateProperty = (key: string, value: string) => {
    setProperties((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    setSaving(true);
    updateMutation.mutate(
      { serverId, properties },
      { onSettled: () => setSaving(false) }
    );
  };

  const buildFields = () => {
    return Object.entries(properties).map(([key, value]) => {
      const meta = PROPERTY_META[key];
      if (meta) return { key, value, ...meta };
      const isBool = value === "true" || value === "false";
      const isNum = !isNaN(Number(value)) && value !== "";
      return {
        key,
        value,
        type: (isBool ? "boolean" : isNum ? "number" : "text") as "text",
        label: key.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        category: "Other",
      };
    });
  };

  const fields = buildFields();
  const categories = Array.from(new Set(fields.map((f) => f.category)));

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold">Server Properties</h2>
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          Loading server.properties...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* JVM Settings */}
      <Card className="rounded-xl border-blue-500/20">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            JVM Settings
            <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">Java Only</Badge>
            {sysInfo && (
              <Badge variant="outline" className="text-xs ml-auto font-normal">
                System: {(sysInfo.totalRamMB / 1024).toFixed(0)} GB RAM · {sysInfo.freeRamMB > 0 ? `${(sysInfo.freeRamMB / 1024).toFixed(1)} GB free` : ""}
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Configure JVM memory for the Minecraft server process. Changes apply on next restart.</p>
        </CardHeader>
        <Separator />
        <CardContent className="p-5 space-y-5">
          {/* Xmx */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Max RAM (Xmx)</Label>
                <p className="text-xs text-muted-foreground">Maximum heap size allocated to the server</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={xmx}
                  min={512}
                  max={xmxMax}
                  step={256}
                  className="h-8 text-sm font-mono w-24"
                  onChange={(e) => { setXmx(Math.min(Number(e.target.value), xmxMax)); setJvmDirty(true); }}
                />
                <span className="text-xs text-muted-foreground">MB ({(xmx / 1024).toFixed(1)} GB)</span>
              </div>
            </div>
            <Slider
              value={[xmx]}
              onValueChange={([v]) => { setXmx(v); setJvmDirty(true); }}
              min={512} max={xmxMax} step={256}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>512 MB</span>
              <span className="font-medium text-foreground">{xmx} MB ({(xmx / 1024).toFixed(1)} GB)</span>
              <span>{systemRamMB > 0 ? `${(xmxMax / 1024).toFixed(0)} GB (system max)` : "32 GB"}</span>
            </div>
          </div>

          {/* Xms */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Initial RAM (Xms)</Label>
                <p className="text-xs text-muted-foreground">Initial heap size — should be ≤ Max RAM</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={xms}
                  min={256}
                  max={xmx}
                  step={256}
                  className="h-8 text-sm font-mono w-24"
                  onChange={(e) => { setXms(Math.min(Number(e.target.value), xmx)); setJvmDirty(true); }}
                />
                <span className="text-xs text-muted-foreground">MB ({(xms / 1024).toFixed(1)} GB)</span>
              </div>
            </div>
            <Slider
              value={[xms]}
              onValueChange={([v]) => { setXms(v); setJvmDirty(true); }}
              min={256} max={xmx} step={256}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>256 MB</span><span className="font-medium text-foreground">{xms} MB</span><span>{xmx} MB</span>
            </div>
          </div>

          {/* Preview & Save */}
          <div className="flex items-center justify-between pt-1">
            <code className="text-xs text-muted-foreground bg-muted rounded px-2 py-1 font-mono">
              -Xmx{xmx}M -Xms{xms}M
            </code>
            <Button
              size="sm"
              className="gap-1.5 h-8 bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleSaveJvm}
              disabled={!jvmDirty || jvmSaving}
            >
              {jvmSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save JVM Args
            </Button>
          </div>

          <Separator />

          {/* Auto-Restart on Crash */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">Auto-Restart on Crash</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically restart the server on crash — not triggered by manual stop
              </p>
            </div>
            <Switch
              checked={autoRestart}
              onCheckedChange={(v) => {
                setAutoRestart(v);
                toggleAutoRestartMutation.mutate({ serverId, enabled: v });
              }}
              disabled={toggleAutoRestartMutation.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Resource Allocation Limits */}
      <Card className="rounded-xl border-orange-500/20">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-sm flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-orange-400" />
            Resource Allocation Limits
            <Badge variant="outline" className="text-xs text-orange-400 border-orange-500/30">Dashboard Display</Badge>
            {sysInfo && systemDiskMB > 0 && (
              <Badge variant="outline" className="text-xs ml-auto font-normal">
                Drive: {(systemDiskMB / 1024).toFixed(0)} GB total · {(freeDiskMB / 1024).toFixed(1)} GB free
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">RAM limit is auto-synced with JVM Xmx. Storage limit is detected from your drive.</p>
        </CardHeader>
        <Separator />
        <CardContent className="p-5 space-y-5">
          {/* RAM Limit — auto-synced with xmx */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Dashboard RAM Limit</Label>
                <p className="text-xs text-muted-foreground">Auto-synced with JVM Max RAM (Xmx) — {xmx} MB</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={ramLimit}
                  min={512}
                  max={xmxMax}
                  step={256}
                  className="h-8 text-sm font-mono w-24"
                  onChange={(e) => { setRamLimit(Number(e.target.value)); setLimitsDirty(true); }}
                />
                <span className="text-xs text-muted-foreground">MB ({(ramLimit / 1024).toFixed(1)} GB)</span>
              </div>
            </div>
            <Slider
              value={[ramLimit]}
              onValueChange={([v]) => { setRamLimit(v); setLimitsDirty(true); }}
              min={512} max={xmxMax} step={256}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>512 MB</span>
              <span className="font-medium text-foreground">{ramLimit} MB</span>
              <span>{systemRamMB > 0 ? `${(xmxMax / 1024).toFixed(0)} GB (system max)` : "32 GB"}</span>
            </div>
          </div>

          {/* Storage Limit */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Dashboard Storage Limit</Label>
                <p className="text-xs text-muted-foreground">
                  {systemDiskMB > 0
                    ? `Total drive: ${(systemDiskMB / 1024).toFixed(1)} GB · ${(freeDiskMB / 1024).toFixed(1)} GB free`
                    : "Allocated disk space limit for gauge display"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={storageLimit}
                  min={1024}
                  max={diskMax}
                  step={1024}
                  className="h-8 text-sm font-mono w-24"
                  onChange={(e) => { setStorageLimit(Math.min(Number(e.target.value), diskMax)); setLimitsDirty(true); }}
                />
                <span className="text-xs text-muted-foreground">MB ({(storageLimit / 1024).toFixed(1)} GB)</span>
              </div>
            </div>
            <Slider
              value={[storageLimit]}
              onValueChange={([v]) => { setStorageLimit(v); setLimitsDirty(true); }}
              min={1024} max={diskMax} step={1024}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 GB</span>
              <span className="font-medium text-foreground">{(storageLimit / 1024).toFixed(1)} GB</span>
              <span>{systemDiskMB > 0 ? `${(diskMax / 1024).toFixed(0)} GB (drive total)` : "100 GB"}</span>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              className="gap-1.5 h-8 bg-orange-600 text-white hover:bg-orange-700"
              onClick={handleSaveLimits}
              disabled={!limitsDirty || limitsSaving}
            >
              {limitsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Limits
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Server Properties</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edit server.properties ({Object.keys(properties).length} settings)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="w-3.5 h-3.5" /> Reload
          </Button>
          <Button size="sm" className="gap-1.5 h-8 bg-accent text-white hover:bg-accent/90" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </Button>
        </div>
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-500">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Unsaved changes. Server restart required to apply some settings.
        </div>
      )}

      {categories.map((cat) => (
        <Card key={cat} className="rounded-xl">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{cat}</Badge>
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {fields.filter((f) => f.category === cat).map((field) => (
              <div key={field.key} className="space-y-2">
                <div>
                  <Label className="text-xs font-medium">{field.label}</Label>
                  {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                  <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">{field.key}</p>
                </div>
                {field.type === "boolean" && (
                  <div className="flex items-center gap-2">
                    <Switch checked={field.value === "true"} onCheckedChange={(v) => updateProperty(field.key, v ? "true" : "false")} />
                    <span className="text-xs text-muted-foreground">{field.value === "true" ? "Enabled" : "Disabled"}</span>
                  </div>
                )}
                {field.type === "text" && (
                  <Input value={field.value} onChange={(e) => updateProperty(field.key, e.target.value)} className="h-8 text-sm font-mono" />
                )}
                {field.type === "number" && (
                  <Input type="number" value={field.value} onChange={(e) => updateProperty(field.key, e.target.value)} className="h-8 text-sm font-mono" />
                )}
                {field.type === "slider" && (
                  <div className="space-y-2 pt-1">
                    <Slider
                      value={[Number(field.value) || 0]}
                      onValueChange={(v) => updateProperty(field.key, String(v[0]))}
                      min={field.min ?? 0}
                      max={field.max ?? 100}
                      step={1}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{field.min ?? 0}</span>
                      <span className="font-medium text-foreground">{field.value}</span>
                      <span>{field.max ?? 100}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
