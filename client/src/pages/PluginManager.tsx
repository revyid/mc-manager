import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import {
  Download, ExternalLink, Loader2, Package, Search, Trash2, Upload,
  Globe, ArrowDownToLine, Check,
} from "lucide-react";
import { toast } from "sonner";

export default function PluginManager({ serverId, serverType, gameVersion }: { serverId: number; serverType?: string; gameVersion?: string }) {
  const { isAuthenticated } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("installed");
  const [versionPickerProject, setVersionPickerProject] = useState<any>(null);
  const [deleteDialog, setDeleteDialog] = useState<any>(null);
  const utils = trpc.useUtils();

  const isBedrock = serverType === "bedrock";
  const isModServer = serverType === "fabric" || serverType === "forge" || serverType === "neoforge";
  const defaultPluginType = isModServer ? "mod" : "plugin";
  const label = isBedrock ? "Addons" : isModServer ? "Mods" : "Plugins";

  const { data: plugins = [], isLoading } = trpc.plugins.list.useQuery(
    { serverId },
    { enabled: isAuthenticated && !isBedrock }
  );

  const { data: addons = [], isLoading: addonsLoading } = trpc.plugins.listAddons.useQuery(
    { serverId },
    { enabled: isAuthenticated && isBedrock }
  );

  const { data: searchResults = [], isLoading: searching } = trpc.plugins.searchOnline.useQuery(
    { query: searchQuery, pluginType: defaultPluginType, platform: "modrinth", mcVersion: gameVersion, loader: serverType },
    { enabled: isAuthenticated && activeTab === "online" && searchQuery.length >= 2 && !isBedrock, refetchOnWindowFocus: false }
  );

  const { data: modVersions = [], isLoading: versionsLoading } = trpc.plugins.listModVersions.useQuery(
    { projectSlug: versionPickerProject?.id || "", gameVersion, loader: serverType },
    { enabled: isAuthenticated && !!versionPickerProject }
  );

  const invalidate = () => utils.plugins.list.invalidate({ serverId });
  const toggleMutation = trpc.plugins.toggle.useMutation({ onSuccess: invalidate });
  const deleteMutation = trpc.plugins.delete.useMutation({ onSuccess: invalidate });
  const uploadMutation = trpc.plugins.upload.useMutation({
    onSuccess: () => { toast.success("Uploaded"); setSelectedFile(null); invalidate(); }
  });
  const downloadMutation = trpc.plugins.downloadOnline.useMutation({
    onSuccess: (data) => { toast.success(data.message); setVersionPickerProject(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const handleUpload = async () => {
    if (!selectedFile) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await uploadMutation.mutateAsync({ serverId, filename: selectedFile.name, fileData: e.target?.result as string });
      } catch (err: any) {
        toast.error(err.message || "Upload failed");
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleInstall = (result: any) => {
    if (result.compatible === false) {
      setVersionPickerProject(result);
    } else {
      downloadMutation.mutate({ serverId, projectSlug: result.id, source: result.source });
    }
  };

  const handleInstallVersion = (projectSlug: string, versionId: string) => {
    downloadMutation.mutate({ serverId, projectSlug, source: "modrinth", versionId });
  };

  const installedList = isBedrock ? addons : plugins;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{label}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{(installedList as any[]).length} installed</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 bg-muted/50 p-0.5">
          <TabsTrigger value="installed" className="h-8 px-3 text-xs gap-1.5 data-[state=active]:bg-background">
            <Package className="w-3.5 h-3.5" /> Installed
          </TabsTrigger>
          {!isBedrock && (
            <TabsTrigger value="online" className="h-8 px-3 text-xs gap-1.5 data-[state=active]:bg-background">
              <Globe className="w-3.5 h-3.5" /> Online
            </TabsTrigger>
          )}
          <TabsTrigger value="upload" className="h-8 px-3 text-xs gap-1.5 data-[state=active]:bg-background">
            <Upload className="w-3.5 h-3.5" /> Upload
          </TabsTrigger>
        </TabsList>

        {/* Installed tab */}
        <TabsContent value="installed" className="mt-4">
          {(isBedrock ? addonsLoading : isLoading) ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : (installedList as any[]).length === 0 ? (
            <Card className="rounded-xl border-dashed">
              <CardContent className="py-12 flex flex-col items-center gap-2">
                <Package className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No {label.toLowerCase()} installed</p>
                <p className="text-xs text-muted-foreground">
                  {isBedrock ? "Upload .mcaddon or .mcpack files" : "Browse online or upload a .jar file"}
                </p>
              </CardContent>
            </Card>
          ) : isBedrock ? (
            <div className="space-y-2">
              {(addons as any[]).map((addon: any, i: number) => (
                <Card key={i} className="rounded-xl">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${addon.type === "behavior" ? "bg-blue-500/10" : "bg-purple-500/10"}`}>
                      <Package className={`w-4 h-4 ${addon.type === "behavior" ? "text-blue-400" : "text-purple-400"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{addon.name}</p>
                      <p className="text-xs text-muted-foreground">{addon.type === "behavior" ? "Behavior Pack" : "Resource Pack"} · {addon.enabled ? "Enabled" : "Disabled"}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {(plugins as any[]).map((plugin) => (
                <Card key={plugin.id} className="rounded-xl">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{plugin.name}</p>
                        <Badge variant={plugin.enabled ? "default" : "secondary"} className={`text-xs ${plugin.enabled ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/10" : ""}`}>
                          {plugin.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      {plugin.version && <p className="text-xs text-muted-foreground">v{plugin.version}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Switch
                        checked={Boolean(plugin.enabled)}
                        onCheckedChange={(val) => toggleMutation.mutate({ pluginId: plugin.id, enabled: val, serverId })}
                        disabled={toggleMutation.isPending}
                      />
                      <Button
                        size="icon" variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteDialog(plugin)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Online tab */}
        {!isBedrock && (
          <TabsContent value="online" className="mt-4">
            <div className="space-y-4">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${defaultPluginType === "mod" ? "mods" : "plugins"} on Modrinth...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
              </div>

              {searching ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
              ) : (searchResults as any[]).length > 0 ? (
                <div className="space-y-2">
                  {(searchResults as any[]).map((result: any) => (
                    <Card key={result.id} className="rounded-xl">
                      <CardContent className="p-4 flex items-center gap-4">
                        {result.icon ? (
                          <img src={result.icon} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{result.name}</p>
                            <Badge variant="outline" className="text-xs">{result.source}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <ArrowDownToLine className="w-3 h-3" /> {result.downloads?.toLocaleString()}
                            </span>
                            {result.author && <span className="text-xs text-muted-foreground">by {result.author}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {result.projectUrl && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={result.projectUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </Button>
                          )}
                          {result.compatible === false && gameVersion && (
                            <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30">
                              {gameVersion}?
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            className={`h-8 gap-1.5 ${result.compatible === false ? "bg-yellow-600 hover:bg-yellow-700 text-white" : "bg-accent text-white hover:bg-accent/90"}`}
                            disabled={downloadMutation.isPending}
                            onClick={() => handleInstall(result)}
                          >
                            {downloadMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            {result.compatible === false ? "Versions" : "Install"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <Card className="rounded-xl border-dashed">
                  <CardContent className="py-8 flex flex-col items-center gap-2">
                    <p className="text-sm text-muted-foreground">No results found</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="rounded-xl border-dashed">
                  <CardContent className="py-8 flex flex-col items-center gap-2">
                    <Globe className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Search for {defaultPluginType === "mod" ? "mods" : "plugins"} on Modrinth</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        )}

        {/* Upload tab */}
        <TabsContent value="upload" className="mt-4">
          <Card className="rounded-xl border-dashed border-2">
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {isBedrock ? "Upload .mcaddon or .mcpack files" : "Upload .jar plugin files"}
                </p>
                <div className="flex gap-3 items-center w-full max-w-md">
                  <Input
                    type="file"
                    accept={isBedrock ? ".mcaddon,.mcpack,.zip" : ".jar,.zip"}
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="flex-1 h-9 text-xs"
                  />
                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || uploadMutation.isPending}
                    className="bg-accent text-white hover:bg-accent/90 gap-1.5 h-9 shrink-0"
                  >
                    {uploadMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    Upload
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Version Picker Dialog */}
      <Dialog open={!!versionPickerProject} onOpenChange={(open) => { if (!open) setVersionPickerProject(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Version — {versionPickerProject?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {gameVersion ? `Showing versions compatible with MC ${gameVersion}` : "All versions"}
          </p>
          {versionsLoading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : (modVersions as any[]).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No compatible versions found. Try a different mod or check on Modrinth directly.
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {(modVersions as any[]).map((ver: any) => {
                  const isCompatible = gameVersion ? ver.gameVersions?.includes(gameVersion) : true;
                  return (
                    <Card key={ver.id} className={`rounded-lg ${!isCompatible ? "opacity-60" : ""}`}>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{ver.name || ver.versionNumber}</p>
                            {isCompatible && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{ver.versionNumber}</span>
                            {ver.gameVersions?.length > 0 && (
                              <span className="text-xs text-muted-foreground">MC {ver.gameVersions.slice(0, 3).join(", ")}{ver.gameVersions.length > 3 ? "..." : ""}</span>
                            )}
                            {ver.loaders?.length > 0 && (
                              <span className="text-xs text-muted-foreground">[{ver.loaders.join(", ")}]</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className={`h-7 gap-1 text-xs shrink-0 ${isCompatible ? "bg-accent text-white hover:bg-accent/90" : ""}`}
                          variant={isCompatible ? "default" : "outline"}
                          disabled={downloadMutation.isPending}
                          onClick={() => handleInstallVersion(versionPickerProject.id, ver.id)}
                        >
                          {downloadMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                          Install
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setVersionPickerProject(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={(open) => { if (!open) setDeleteDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Plugin</DialogTitle>
            <DialogDescription>Are you sure you want to delete <strong>{deleteDialog?.name}</strong>? The file will be removed from disk.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => {
              if (deleteDialog) deleteMutation.mutate({ pluginId: deleteDialog.id });
              setDeleteDialog(null);
            }}>
              {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
