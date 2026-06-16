import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  Globe,
  LayoutDashboard,
  LogOut,
  Play,
  Plus,
  Server,
  Square,
  ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { getLoginUrl } from "@/const";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
            <Globe className="w-6 h-6 text-accent" />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-lg font-semibold">Authentication required</h1>
            <p className="text-sm text-muted-foreground">Please sign in to access the dashboard</p>
          </div>
          <Button onClick={() => { window.location.href = getLoginUrl(); }} className="w-full bg-accent text-white hover:bg-accent/90">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-3 border-b border-border px-4 sticky top-0 z-30 bg-background/95 backdrop-blur shrink-0">
          <SidebarTrigger className="-ml-1 h-8 w-8" />
          <div className="h-4 w-px bg-border" />
          <span className="text-sm text-muted-foreground truncate">MC Server Manager</span>
        </header>
        <main className="flex-1 p-4 sm:p-6 bg-background min-h-[calc(100vh-48px)] overflow-x-hidden overflow-y-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppSidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const { data: servers = [], isLoading } = trpc.servers.list.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const startMutation = trpc.servers.start.useMutation();
  const stopMutation = trpc.servers.stop.useMutation();
  const utils = trpc.useUtils();

  const handleToggleServer = async (e: React.MouseEvent, serverId: number, status: string) => {
    e.stopPropagation();
    if (status === "online") {
      await stopMutation.mutateAsync({ serverId });
    } else {
      await startMutation.mutateAsync({ serverId });
    }
    setTimeout(() => utils.servers.list.invalidate(), 1500);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="hover:bg-sidebar-accent">
              <div className="flex aspect-square h-8 w-8 items-center justify-center rounded-lg bg-accent text-white shrink-0">
                <Globe className="h-4 w-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold text-sm">MC Manager</span>
                <span className="text-xs text-sidebar-foreground/60">v2.0</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={location === "/dashboard"}
                  onClick={() => setLocation("/dashboard")}
                  tooltip="Dashboard"
                  className={location === "/dashboard" ? "bg-sidebar-accent text-sidebar-foreground" : ""}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Servers</span>
            {!isCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 hover:bg-sidebar-accent rounded-sm"
                onClick={() => setLocation("/setup")}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading ? (
                <div className="space-y-1 px-2">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-8 w-full rounded-md" />)}
                </div>
              ) : servers.length === 0 ? (
                <div className="px-2 py-3 text-center">
                  <p className="text-xs text-sidebar-foreground/50">No servers yet</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs text-accent hover:text-accent hover:bg-accent/10 w-full"
                    onClick={() => setLocation("/setup")}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add server
                  </Button>
                </div>
              ) : (
                servers.map((server: any) => {
                  const isActive = location.startsWith(`/servers/${server.id}`);
                  const isOnline = server.status === "online";
                  return (
                    <SidebarMenuItem key={server.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(`/servers/${server.id}/overview`)}
                        tooltip={server.name}
                        className={`group ${isActive ? "bg-sidebar-accent" : ""}`}
                      >
                        <div className="relative shrink-0">
                          <Server className="h-4 w-4" />
                          <span className={`absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-sidebar ${isOnline ? "bg-green-500" : "bg-zinc-500"}`} />
                        </div>
                        <span className="truncate flex-1">{server.name}</span>
                        <button
                          onClick={(e) => handleToggleServer(e, server.id, server.status)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (server.status === "online" && confirm("Force stop? (may lose data)")) {
                              stopMutation.mutateAsync({ serverId: server.id, force: true }).then(() => {
                                setTimeout(() => utils.servers.list.invalidate(), 1500);
                              });
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 hover:text-accent transition-opacity h-5 w-5 flex items-center justify-center rounded shrink-0"
                        >
                          {isOnline
                            ? <Square className="h-3 w-3" />
                            : <Play className="h-3 w-3" />
                          }
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
              {!isCollapsed && servers.length > 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setLocation("/setup")}
                    className="text-muted-foreground hover:text-foreground"
                    tooltip="New Server"
                  >
                    <Plus className="h-4 w-4" />
                    <span>New server</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="hover:bg-sidebar-accent">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-accent text-white text-xs font-semibold">
                      {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none min-w-0">
                    <span className="text-sm font-medium truncate">{user?.name}</span>
                    <span className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</span>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-48 mb-1">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-0.5">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
