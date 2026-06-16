import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Loader2, Play, RotateCw, Server,
  Settings, Square, Terminal, Package, Users, BarChart3, Globe,
  FolderOpen, Pencil,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import ServerConsole from "./ServerConsole";
import PlayerManagement from "./PlayerManagement";
import WorldManagement from "./WorldManagement";
import PluginManager from "./PluginManager";
import PerformanceMonitor from "./PerformanceMonitor";
import PropertiesEditor from "./PropertiesEditor";
import FileManager from "./FileManager";

const getTabs = (serverType?: string | null) => {
  const isBedrock = serverType === "bedrock";
  const isMod = serverType === "fabric" || serverType === "forge" || serverType === "neoforge";
  const pluginLabel = isBedrock ? "Addons" : isMod ? "Mods" : "Plugins";
  return [
    { value: "overview", label: "Overview", icon: Server },
    { value: "console", label: "Console", icon: Terminal },
    { value: "players", label: "Players", icon: Users },
    { value: "plugins", label: pluginLabel, icon: Package },
    { value: "worlds", label: "Worlds", icon: Globe },
    { value: "files", label: "Files", icon: FolderOpen },
    { value: "monitoring", label: "Monitor", icon: BarChart3 },
    { value: "settings", label: "Settings", icon: Settings },
  ];
};

export default function ServerWorkspace({ params }: { params: { serverId: string; tab?: string } }) {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const serverId = parseInt(params.serverId);
  const currentTab = params.tab || "overview";

  const [editingName, setEditingName] = useState(false);
  const [serverName, setServerName] = useState("");

  const { data: server, isLoading: statusLoading } = trpc.servers.status.useQuery(
    { serverId },
    { enabled: isAuthenticated, refetchInterval: 5000 }
  );

  const { data: serverInfo, isLoading: infoLoading } = trpc.servers.list.useQuery(undefined, {
    enabled: isAuthenticated,
    select: (data) => data.find((s) => s.id === serverId),
  });

  const startMutation = trpc.servers.start.useMutation();
  const stopMutation = trpc.servers.stop.useMutation();
  const restartMutation = trpc.servers.restart.useMutation();
  const renameMutation = trpc.servers.rename.useMutation();
  const utils = trpc.useUtils();

  const handleStart = async () => {
    try { await startMutation.mutateAsync({ serverId }); toast.success("Starting…"); utils.servers.list.invalidate(); }
    catch (e: any) { toast.error(e.message); }
  };
  const handleStop = async (force = false) => {
    try {
      await stopMutation.mutateAsync({ serverId, force });
      toast.success(force ? "Server force stopped" : "Server stopping gracefully (saving world)...");
      setTimeout(() => { utils.servers.list.invalidate(); utils.servers.status.invalidate({ serverId }); }, 2000);
    } catch (e: any) { toast.error(e.message); }
  };
  const handleRestart = async () => {
    try { await restartMutation.mutateAsync({ serverId }); toast.success("Restarting gracefully…"); utils.servers.list.invalidate(); }
    catch (e: any) { toast.error(e.message); }
  };

  if (infoLoading || statusLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!serverInfo) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <p className="text-muted-foreground">Server not found</p>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>Back to Dashboard</Button>
        </div>
      </DashboardLayout>
    );
  }

  const isOnline = server?.status === "online";
  const isBusy = startMutation.isPending || stopMutation.isPending || restartMutation.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-6xl">
        {/* Server Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 -ml-1" onClick={() => setLocation("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isOnline ? "bg-green-500/10" : "bg-muted"}`}>
              <Server className={`w-5 h-5 ${isOnline ? "text-green-500" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {editingName ? (
                  <input
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    className="text-xl font-bold bg-background border border-border rounded px-2 py-0.5 outline-none focus:border-accent"
                    autoFocus
                    onBlur={() => {
                      if (serverName && serverName !== serverInfo.name) {
                        renameMutation.mutate({ serverId, name: serverName });
                      } else {
                        setEditingName(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                  />
                ) : (
                  <h1
                    className="text-xl font-bold cursor-pointer hover:text-accent transition-colors"
                    onClick={() => { setServerName(serverInfo.name); setEditingName(true); }}
                  >
                    {serverInfo.name}
                  </h1>
                )}
                {!editingName && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setServerName(serverInfo.name); setEditingName(true); }}>
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </Button>
                )}
                <Badge variant={isOnline ? "default" : "secondary"} className={`text-xs ${isOnline ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/10" : ""}`}>
                  {isOnline ? "Online" : "Offline"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {serverInfo.type.toUpperCase()} · Port {serverInfo.port}
                {serverInfo.version && ` · v${serverInfo.version}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOnline ? (
              <Button size="sm" onClick={handleStart} disabled={isBusy} className="bg-accent text-white hover:bg-accent/90 gap-1.5">
                {startMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Start
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleStop(false)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (confirm("FORCE stop server? (may cause data loss)")) handleStop(true);
                  }}
                  disabled={isBusy}
                  className="gap-1.5"
                  title="Left click: Graceful stop | Right click: Force stop"
                >
                  {stopMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                  Stop
                </Button>
                <Button size="sm" variant="outline" onClick={handleRestart} disabled={isBusy} className="gap-1.5">
                  {restartMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                  Restart
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={currentTab} onValueChange={(v) => setLocation(`/servers/${serverId}/${v}`)}>
          <div className="overflow-x-auto -mx-1 px-1 pb-0.5 scrollbar-none">
            <TabsList className="h-9 bg-muted/50 p-0.5 inline-flex gap-0.5">
              {getTabs(serverInfo.type).map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-8 px-3 text-xs gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{label.slice(0, 3)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-5 outline-none">
            <OverviewTab serverId={serverId} serverInfo={serverInfo} isOnline={isOnline} />
          </TabsContent>
          <TabsContent value="console" className="mt-5 outline-none"><ServerConsole serverId={serverId} /></TabsContent>
          <TabsContent value="players" className="mt-5 outline-none"><PlayerManagement serverId={serverId} /></TabsContent>
          <TabsContent value="plugins" className="mt-5 outline-none"><PluginManager serverId={serverId} serverType={serverInfo.type ?? undefined} gameVersion={serverInfo.version ?? undefined} /></TabsContent>
          <TabsContent value="worlds" className="mt-5 outline-none"><WorldManagement serverId={serverId} /></TabsContent>
          <TabsContent value="files" className="mt-5 outline-none"><FileManager serverId={serverId} /></TabsContent>
          <TabsContent value="monitoring" className="mt-5 outline-none"><PerformanceMonitor serverId={serverId} isOnline={isOnline} /></TabsContent>
          <TabsContent value="settings" className="mt-5 outline-none"><PropertiesEditor serverId={serverId} /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function OverviewTab({ serverId, serverInfo, isOnline }: { serverId: number; serverInfo: any; isOnline: boolean }) {
  const { isAuthenticated } = useAuth();
  const { data: metrics = [] } = trpc.performance.getMetrics.useQuery(
    { serverId },
    { enabled: isAuthenticated, refetchInterval: 10000 }
  );
  const { data: live } = trpc.servers.getLiveStats.useQuery(
    { serverId },
    { enabled: isAuthenticated && isOnline, refetchInterval: 5000 }
  );

  const latest = metrics[metrics.length - 1];
  const playerCount = (live as any)?.players ?? 0;

  const stats = [
    { label: "Status", value: isOnline ? "Online" : "Offline", accent: isOnline },
    { label: "Players", value: `${playerCount} / ${serverInfo.maxPlayers}` },
    { label: "CPU", value: latest ? `${latest.cpu}%` : (live ? "0%" : "—") },
    { label: "RAM", value: latest ? `${latest.ram} MB` : (live ? "0 MB" : "—") },
    { label: "TPS", value: latest ? `${latest.tps}` : "—" },
    { label: "Version", value: serverInfo.version || "Unknown" },
    { label: "Type", value: serverInfo.type.toUpperCase() },
    { label: "Port", value: String(serverInfo.port) },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(({ label, value, accent }) => (
        <Card key={label} className="stat-card">
          <CardContent className="p-0">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-lg font-bold ${accent ? "text-green-500" : ""}`}>{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
