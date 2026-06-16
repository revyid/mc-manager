import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Server, Package, Settings, Download } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

type ServerType = "java" | "bedrock" | "bedrock-linux" | "fabric" | "paper" | "purpur" | "spigot" | "forge" | "neoforge" | "pocketmine" | "nukkit" | "cloudburst";
type Step = "type" | "version" | "config" | "download" | "complete";

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
  { id: "type", label: "Type", icon: Server },
  { id: "version", label: "Version", icon: Package },
  { id: "config", label: "Config", icon: Settings },
  { id: "download", label: "Download", icon: Download },
];

const SERVER_TYPES = [
  { value: "paper",    label: "Paper",      desc: "High-performance fork of Spigot. Most popular choice.", badge: "Recommended", group: "Java" },
  { value: "java",     label: "Vanilla Java", desc: "Official Mojang server. Pure vanilla experience.",   badge: "Vanilla",     group: "Java" },
  { value: "fabric",   label: "Fabric",      desc: "Lightweight mod loader. Great for performance mods.", badge: "Mods",        group: "Java" },
  { value: "purpur",   label: "Purpur",      desc: "Fork of Paper with extra gameplay tweaks.",            badge: "Tweaked",     group: "Java" },
  { value: "spigot",   label: "Spigot",      desc: "Classic plugin server. Requires BuildTools to build.", badge: "Plugins",     group: "Java" },
  { value: "forge",    label: "Forge",       desc: "Most popular mod loader for heavy modpacks.",          badge: "Modpacks",    group: "Java" },
  { value: "neoforge", label: "NeoForge",    desc: "Modern Forge fork. Future of modded Minecraft.",      badge: "Modern",      group: "Java" },
  { value: "bedrock",  label: "Bedrock (Win)", desc: "Official Windows Bedrock server.",          badge: "Windows", group: "Bedrock" },
  { value: "bedrock-linux", label: "Bedrock (Linux)", desc: "Official Linux Bedrock server.",          badge: "Linux", group: "Bedrock" },
  { value: "pocketmine", label: "PocketMine-MP", desc: "Highly customizable PHP-based Bedrock server.", badge: "Custom", group: "Bedrock" },
  { value: "nukkit", label: "Nukkit", desc: "Java-based Bedrock server with plugin support.", badge: "Plugins", group: "Bedrock" },
  { value: "cloudburst", label: "Cloudburst", desc: "Modern Java-based Bedrock server.", badge: "Modern", group: "Bedrock" },
] as const;

export default function AutoSetupWizard() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("type");
  const [config, setConfig] = useState({
    name: "My Server",
    type: "java" as ServerType,
    version: "",
    port: 25565,
    maxPlayers: 20,
    acceptEula: false,
    javaArgs: "-Xmx2G -Xms1G",
  });

  const { data: versions = [], isLoading: versionsLoading } = trpc.servers.getAvailableVersions.useQuery(
    { type: config.type as any },
    { enabled: step === "version" }
  );

  const createMutation = trpc.servers.create.useMutation();
  const downloadMutation = trpc.servers.downloadJar.useMutation();

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isDownloading = step === "download";

  const handleNext = async () => {
    if (step === "type") { setStep("version"); return; }
    if (step === "version") {
      if (!config.version) { toast.error("Select a version"); return; }
      setStep("config"); return;
    }
    if (step === "config") {
      if (!config.name.trim()) { toast.error("Server name required"); return; }
      const isBedrockType = ["bedrock", "bedrock-linux", "pocketmine", "nukkit", "cloudburst"].includes(config.type);
      if (!isBedrockType && !config.acceptEula) { toast.error("Accept the EULA to continue"); return; }
      setStep("download");
      try {
        const server = await createMutation.mutateAsync({ name: config.name, type: config.type as any, port: config.port, maxPlayers: config.maxPlayers });
        if (!server) throw new Error("Failed to create server");
        await downloadMutation.mutateAsync({ serverId: server.id, version: config.version });
        toast.success("Server ready!");
        setStep("complete");
      } catch (e: any) {
        toast.error(e.message || "Setup failed");
        setStep("config");
      }
    }
  };

  const handlePrev = () => {
    if (step === "version") setStep("type");
    else if (step === "config") setStep("version");
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold">Create Server</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Set up a new Minecraft server in minutes</p>
        </div>

        {/* Progress */}
        {step !== "complete" && (
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < stepIndex;
              const active = s.id === step;
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <div className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                    active ? "bg-accent/10 text-accent" : done ? "text-muted-foreground" : "text-muted-foreground/50"
                  )}>
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0",
                      active ? "bg-accent text-white" : done ? "bg-accent/20 text-accent" : "bg-muted"
                    )}>
                      {done ? "✓" : i + 1}
                    </div>
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={cn("flex-1 h-px mx-1", done ? "bg-accent/30" : "bg-border")} />}
                </div>
              );
            })}
          </div>
        )}

        {/* Step: Type */}
        {step === "type" && (
          <Card className="rounded-xl">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold">Choose Server Type</h2>
              {(["Java", "Bedrock"] as const).map((group) => (
                <div key={group} className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{group}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SERVER_TYPES.filter((t) => t.group === group).map(({ value, label, desc, badge }) => (
                      <div
                        key={value}
                        onClick={() => setConfig({ ...config, type: value as ServerType, version: "" })}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all",
                          config.type === value ? "border-accent bg-accent/5" : "border-border hover:border-border/80"
                        )}
                      >
                        <div className={cn("w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center", config.type === value ? "border-accent" : "border-muted-foreground/30")}>
                          {config.type === value && <div className="w-2 h-2 rounded-full bg-accent" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{label}</span>
                            <Badge variant="outline" className="text-xs py-0">{badge}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Step: Version */}
        {step === "version" && (
          <Card className="rounded-xl">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold">Select Version</h2>

              {/* Warning for manual-install types */}
              {(["spigot", "forge", "neoforge"] as ServerType[]).includes(config.type) && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-500">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <div>
                    <span className="font-medium capitalize">{config.type}</span>
                    {config.type === "spigot"
                      ? " requires BuildTools to compile. We'll download BuildTools.jar for you — run it to build the server."
                      : " requires running the installer manually after download. A README will be placed in your server folder."}
                  </div>
                </div>
              )}

              {versionsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading versions…
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>
                    {config.type === "neoforge" ? "NeoForge Version (MC)" :
                     config.type === "forge" ? "Forge Version (MC)" :
                     "Minecraft Version"}
                  </Label>
                  <Select value={config.version} onValueChange={(v) => setConfig({ ...config, version: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a version" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(versions as any[]).map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.id}
                          {v.type && v.type !== "release" && <span className="text-muted-foreground text-xs ml-1">({v.type})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {config.version && (
                    <p className="text-xs text-muted-foreground">Selected: <span className="text-foreground font-medium">{config.version}</span></p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Config */}
        {step === "config" && (
          <Card className="rounded-xl">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-semibold">Configure Server</h2>

              <div className="space-y-1.5">
                <Label>Server Name</Label>
                <Input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} placeholder="My Awesome Server" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Port</Label>
                  <Input type="number" value={config.port} onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 25565 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Max Players</Label>
                  <Input type="number" value={config.maxPlayers} onChange={(e) => setConfig({ ...config, maxPlayers: parseInt(e.target.value) || 20 })} />
                </div>
              </div>

              {!isBedrockType && (
                <>
                  <div className="space-y-1.5">
                    <Label>Java Arguments</Label>
                    <Input value={config.javaArgs} onChange={(e) => setConfig({ ...config, javaArgs: e.target.value })} placeholder="-Xmx2G -Xms1G" />
                  </div>

                  <Separator />

                  <div className={cn(
                    "flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer transition-all",
                    config.acceptEula ? "border-accent bg-accent/5" : "border-border"
                  )} onClick={() => setConfig({ ...config, acceptEula: !config.acceptEula })}>
                    <Checkbox id="eula" checked={config.acceptEula} onCheckedChange={(v) => setConfig({ ...config, acceptEula: !!v })} />
                    <div>
                      <Label htmlFor="eula" className="cursor-pointer text-sm">I agree to the Minecraft End User License Agreement</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noopener" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>Read EULA ↗</a>
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Downloading */}
        {step === "download" && (
          <Card className="rounded-xl">
            <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-accent animate-spin" />
              </div>
              <div>
                <h2 className="font-semibold">Setting up your server…</h2>
                <p className="text-sm text-muted-foreground mt-1">Downloading {config.type} server files for {config.version}</p>
              </div>
              <div className="w-full max-w-xs h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-accent rounded-full animate-pulse w-2/3" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Complete */}
        {step === "complete" && (
          <Card className="rounded-xl">
            <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </div>
              <div>
                <h2 className="font-semibold">
                  {(["spigot","forge","neoforge"] as ServerType[]).includes(config.type) ? "Files Downloaded!" : "Server Created!"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {(["spigot","forge","neoforge"] as ServerType[]).includes(config.type)
                    ? `Check your server folder for setup instructions (README_${config.type.toUpperCase()}.txt).`
                    : <><span className="font-medium text-foreground">{config.name}</span> ({config.type} {config.version}) is ready.</>
                  }
                </p>
              </div>
              <Button onClick={() => setLocation("/dashboard")} className="bg-accent text-white hover:bg-accent/90 gap-2 w-full max-w-xs">
                Go to Dashboard <ChevronRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Nav buttons */}
        {step !== "complete" && !isDownloading && (
          <div className="flex justify-between">
            <Button variant="outline" onClick={handlePrev} disabled={step === "type"} className="gap-1.5">
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={handleNext} disabled={createMutation.isPending || downloadMutation.isPending} className="bg-accent text-white hover:bg-accent/90 gap-1.5">
              {step === "config" ? "Create Server" : "Next"} <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
