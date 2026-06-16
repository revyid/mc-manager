import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { Loader2, Search, Shield, ShieldOff, UserX, Crown, CrownIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Player {
  id: string;
  username: string;
  uuid: string;
  joinTime: string;
  isOp: boolean;
  isBanned: boolean;
}

export default function PlayerManagement({ serverId }: { serverId: number }) {
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const { data: players = [], isLoading } = trpc.players.list.useQuery(
    { serverId },
    { enabled: isAuthenticated, refetchInterval: 5000 }
  );

  const invalidate = () => utils.players.list.invalidate({ serverId });
  const kickMutation = trpc.players.kick.useMutation({ onSuccess: invalidate });
  const banMutation = trpc.players.ban.useMutation({ onSuccess: invalidate });
  const unbanMutation = trpc.players.unban.useMutation({ onSuccess: invalidate });
  const opMutation = trpc.players.op.useMutation({ onSuccess: invalidate });
  const deopMutation = trpc.players.deop.useMutation({ onSuccess: invalidate });

  const filtered = (players as Player[]).filter((p) =>
    p.username.toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = async (
    fn: () => Promise<any>,
    successMsg: string,
    errorMsg: string
  ) => {
    try { await fn(); toast.success(successMsg); }
    catch { toast.error(errorMsg); }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Players</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {players.length} player{players.length !== 1 ? "s" : ""} online
          </p>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search players…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : players.length === 0 ? (
        <Card className="rounded-xl border-dashed">
          <CardContent className="py-12 flex flex-col items-center gap-2 text-center">
            <Shield className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No players online</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Player</TableHead>
                <TableHead className="text-xs">UUID</TableHead>
                <TableHead className="text-xs">Joined</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((player) => (
                <TableRow key={player.id}>
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                        {player.username[0].toUpperCase()}
                      </div>
                      {player.username}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[140px]">
                    {player.uuid}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(player.joinTime).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5 flex-wrap">
                      {player.isOp && <Badge className="text-xs bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/10"><Crown className="w-2.5 h-2.5 mr-1" />OP</Badge>}
                      {player.isBanned && <Badge variant="destructive" className="text-xs">Banned</Badge>}
                      {!player.isOp && !player.isBanned && <Badge variant="outline" className="text-xs">Player</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleAction(
                              () => kickMutation.mutateAsync({ serverId, username: player.username }),
                              `${player.username} kicked`, "Failed to kick"
                            )}
                            disabled={kickMutation.isPending}
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Kick</TooltipContent>
                      </Tooltip>

                      {player.isBanned ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-green-500 hover:text-green-500"
                              onClick={() => handleAction(
                                () => unbanMutation.mutateAsync({ serverId, username: player.username }),
                                `${player.username} unbanned`, "Failed to unban"
                              )}
                              disabled={unbanMutation.isPending}
                            >
                              <ShieldOff className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Unban</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleAction(
                                () => banMutation.mutateAsync({ serverId, username: player.username }),
                                `${player.username} banned`, "Failed to ban"
                              )}
                              disabled={banMutation.isPending}
                            >
                              <Shield className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ban</TooltipContent>
                        </Tooltip>
                      )}

                      {player.isOp ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleAction(
                                () => deopMutation.mutateAsync({ serverId, username: player.username }),
                                `${player.username} deopped`, "Failed to deop"
                              )}
                              disabled={deopMutation.isPending}
                            >
                              <CrownIcon className="w-3.5 h-3.5 text-yellow-500" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove OP</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleAction(
                                () => opMutation.mutateAsync({ serverId, username: player.username }),
                                `${player.username} opped`, "Failed to op"
                              )}
                              disabled={opMutation.isPending}
                            >
                              <Crown className="w-3.5 h-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Give OP</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
