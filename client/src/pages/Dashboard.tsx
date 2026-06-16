import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle, ChevronRight, Loader2, MoreVertical,
  Play, Plus, RotateCw, Server, Square, Terminal, Trash2, Zap,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

export default function Dashboard() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [dangerDialog, setDangerDialog] = useState(false);

  const { data: servers = [], isLoading, refetch } = trpc.servers.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const startMutation = trpc.servers.start.useMutation({ onSuccess: () => refetch() });
  const stopMutation = trpc.servers.stop.useMutation({ onSuccess: () => refetch() });
  const restartMutation = trpc.servers.restart.useMutation({ onSuccess: () => refetch() });
  const deleteMutation = trpc.servers.delete.useMutation({ onSuccess: () => refetch() });
  const clearDbMutation = trpc.system.clearDatabase.useMutation({
    onSuccess: () => { toast.success("Database cleared"); window.location.reload(); },
    onError: (e: any) => toast.error(e.message),
  });

  const totalOnline = servers.filter((s: any) => s.status === "online").length;
  const totalServers = servers.length;

  const handleStart = async (id: number) => {
    try { await startMutation.mutateAsync({ serverId: id }); toast.success("Server starting…"); }
    catch (e: any) { toast.error(e.message || "Failed to start"); }
  };

  const handleStop = async (id: number) => {
    try {
      await stopMutation.mutateAsync({ serverId: id });
      toast.success("Server stopping gracefully (saving world)...");
      setTimeout(() => refetch(), 2000);
    } catch (e: any) { toast.error(e.message || "Failed to stop"); }
  };

  const [forceStopTarget, setForceStopTarget] = useState<number | null>(null);

  const handleRestart = async (id: number) => {
    try {
      await restartMutation.mutateAsync({ serverId: id });
      toast.success("Server restarting gracefully (saving world)...");
      setTimeout(() => refetch(), 3000);
    } catch (e: any) { toast.error(e.message || "Failed to restart"); }
  };

  const handleDelete = async (id: number, name: string) => {
    setDeleteTarget({ id, name });
  };

  return (
    <>
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monitor and manage your Minecraft servers</p>
          </div>
          <Button onClick={() => setLocation("/setup")} className="bg-accent text-white hover:bg-accent/90 gap-2">
            <Plus className="w-4 h-4" /> New Server
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="stat-card">
            <CardContent className="p-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">Total Servers</span>
                <Server className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{totalServers}</p>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">Online</span>
                <div className="online-dot" />
              </div>
              <p className="text-2xl font-bold text-green-500">{totalOnline}</p>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">Offline</span>
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-500" />
              </div>
              <p className="text-2xl font-bold">{totalServers - totalOnline}</p>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="p-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">Uptime Rate</span>
                <Zap className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">
                {totalServers > 0 ? Math.round((totalOnline / totalServers) * 100) : 0}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Server List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
          </div>
        ) : servers.length === 0 ? (
          <Card className="rounded-xl border-dashed">
            <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Server className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No servers yet</p>
                <p className="text-sm text-muted-foreground mt-0.5">Create your first Minecraft server to get started</p>
              </div>
              <Button onClick={() => setLocation("/setup")} className="bg-accent text-white hover:bg-accent/90 gap-2">
                <Plus className="w-4 h-4" /> Create Server
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {servers.map((server: any) => {
              const isOnline = server.status === "online";
              const isBusy = startMutation.isPending || stopMutation.isPending || restartMutation.isPending;

              return (
                <Card key={server.id} className="rounded-xl border border-border hover:border-border/80 transition-all">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`hidden sm:flex w-10 h-10 rounded-lg items-center justify-center shrink-0 ${isOnline ? "bg-green-500/10" : "bg-muted"}`}>
                          <Server className={`w-5 h-5 ${isOnline ? "text-green-500" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => setLocation(`/servers/${server.id}/overview`)}
                              className="font-semibold text-base hover:text-accent transition-colors truncate"
                            >
                              {server.name}
                            </button>
                            <Badge variant={isOnline ? "default" : "secondary"} className={`text-xs ${isOnline ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/10" : ""}`}>
                              {isOnline ? "Online" : "Offline"}
                            </Badge>
                            <Badge variant="outline" className="text-xs capitalize">{server.type}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">
                            Port {server.port} · Max {server.maxPlayers} players
                            {server.version && ` · v${server.version}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5">
                          {!isOnline ? (
                            <Button size="sm" onClick={() => handleStart(server.id)} disabled={isBusy} className="bg-accent text-white hover:bg-accent/90 h-8 gap-1.5">
                              {startMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                              <span className="hidden sm:inline">Start</span>
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm" variant="outline"
                                onClick={() => handleStop(server.id)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setForceStopTarget(server.id);
                                }}
                                disabled={isBusy} className="h-8 gap-1.5"
                                title="Left: Graceful stop | Right-click: Force stop"
                              >
                                {stopMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">Stop</span>
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleRestart(server.id)} disabled={isBusy} className="h-8 gap-1.5">
                                {restartMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">Restart</span>
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setLocation(`/servers/${server.id}/console`)} className="h-8">
                            <Terminal className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setLocation(`/servers/${server.id}/overview`)}>
                              <ChevronRight className="mr-2 h-4 w-4" /> Open workspace
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(server.id, server.name)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete server
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Danger Zone */}
        {servers.length > 0 && (
          <div className="pt-6">
            <Separator className="mb-6" />
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Danger Zone</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Permanently delete all servers and data from the database.</p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDangerDialog(true)}
                disabled={clearDbMutation.isPending}
                className="shrink-0"
              >
                {clearDbMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Reset Database
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>

    {/* Delete Server Dialog */}
    <ConfirmDialog
      open={!!deleteTarget}
      onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      title={`Delete "${deleteTarget?.name}"`}
      description="This cannot be undone. All server files and data will be permanently removed."
      confirmLabel="Delete Server"
      onConfirm={async () => {
        if (deleteTarget) {
          try { await deleteMutation.mutateAsync({ serverId: deleteTarget.id }); toast.success("Server deleted"); }
          catch (e: any) { toast.error(e.message || "Failed to delete"); }
        }
      }}
      loading={deleteMutation.isPending}
    />

    {/* Force Stop Dialog */}
    <ConfirmDialog
      open={!!forceStopTarget}
      onOpenChange={(open) => { if (!open) setForceStopTarget(null); }}
      title="Force Stop Server"
      description="This may cause data loss. The server process will be killed immediately."
      confirmLabel="Force Stop"
      onConfirm={async () => {
        if (forceStopTarget) {
          try { await stopMutation.mutateAsync({ serverId: forceStopTarget, force: true }); toast.success("Force stopped"); refetch(); }
          catch (e: any) { toast.error(e.message); }
        }
      }}
      loading={stopMutation.isPending}
    />

    {/* Danger Zone Dialog */}
    <ConfirmDialog
      open={dangerDialog}
      onOpenChange={setDangerDialog}
      title="Reset Database"
      description="Delete ALL servers and data permanently. This cannot be undone."
      confirmLabel="Reset Everything"
      onConfirm={() => clearDbMutation.mutate()}
      loading={clearDbMutation.isPending}
    />
    </>
  );
}
