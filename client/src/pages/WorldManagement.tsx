import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Archive, Globe, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function WorldManagement({ serverId }: { serverId: number }) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const { data: worlds = [], isLoading: wLoading } = trpc.worlds.list.useQuery({ serverId }, { enabled: isAuthenticated });
  const { data: backups = [], isLoading: bLoading } = trpc.worlds.listBackups.useQuery({ serverId }, { enabled: isAuthenticated });

  const saveMutation = trpc.worlds.save.useMutation({ onSuccess: () => utils.worlds.list.invalidate({ serverId }) });
  const backupMutation = trpc.worlds.backup.useMutation({ onSuccess: () => utils.worlds.listBackups.invalidate({ serverId }) });
  const restoreMutation = trpc.worlds.restore.useMutation();
  const deleteBackupMutation = trpc.worlds.deleteBackup.useMutation({ onSuccess: () => utils.worlds.listBackups.invalidate({ serverId }) });

  const handleSave = async () => {
    try { await saveMutation.mutateAsync({ serverId }); toast.success("Worlds saved"); }
    catch { toast.error("Failed to save"); }
  };

  const handleBackup = async (worldName: string) => {
    try { await backupMutation.mutateAsync({ serverId, worldName }); toast.success(`Backed up ${worldName}`); }
    catch { toast.error("Backup failed"); }
  };

  const handleRestore = async (backupId: number) => {
    if (!confirm("Restore this backup? Current world data will be overwritten.")) return;
    try { await restoreMutation.mutateAsync({ serverId, backupId }); toast.success("Restored!"); }
    catch { toast.error("Restore failed"); }
  };

  const handleDeleteBackup = async (backupId: number) => {
    if (!confirm("Delete this backup?")) return;
    try { await deleteBackupMutation.mutateAsync({ backupId }); toast.success("Deleted"); }
    catch { toast.error("Delete failed"); }
  };

  return (
    <div className="space-y-6">
      {/* Worlds */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Worlds</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{worlds.length} world{worlds.length !== 1 ? "s" : ""}</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save All
          </Button>
        </div>

        {wLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : worlds.length === 0 ? (
          <Card className="rounded-xl border-dashed">
            <CardContent className="py-10 flex flex-col items-center gap-2">
              <Globe className="w-7 h-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No worlds found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {(worlds as any[]).map((world) => (
              <Card key={world.id} className="rounded-xl">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{world.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {world.size || "Unknown size"} · Modified {new Date(world.lastModified).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 shrink-0"
                    onClick={() => handleBackup(world.name)}
                    disabled={backupMutation.isPending}
                  >
                    {backupMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                    Backup
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Backups */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Backups</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{backups.length} backup{backups.length !== 1 ? "s" : ""}</p>
        </div>

        {bLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : backups.length === 0 ? (
          <Card className="rounded-xl border-dashed">
            <CardContent className="py-10 flex flex-col items-center gap-2">
              <Archive className="w-7 h-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No backups yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {(backups as any[]).map((backup) => (
              <Card key={backup.id} className="rounded-xl">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Archive className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{backup.worldName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(backup.createdAt).toLocaleString()} · {backup.fileSize || "0 MB"}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => handleRestore(backup.id)} disabled={restoreMutation.isPending}>
                      {restoreMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      Restore
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteBackup(backup.id)} disabled={deleteBackupMutation.isPending}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
