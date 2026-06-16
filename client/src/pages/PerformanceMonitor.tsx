import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Activity, Cpu, RefreshCw, Zap } from "lucide-react";

interface Point { t: string; cpu: number; ram: number; tps: number }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 shadow-md text-xs space-y-1">
      <p className="font-medium text-muted-foreground">{label}</p>
      {payload.map((e: any) => (
        <div key={e.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }} />
          <span className="text-muted-foreground capitalize">{e.dataKey}:</span>
          <span className="font-medium">{e.value}{e.dataKey === "ram" ? " MB" : e.dataKey === "tps" ? "" : "%"}</span>
        </div>
      ))}
    </div>
  );
};

export default function PerformanceMonitor({ serverId, isOnline }: { serverId: number; isOnline?: boolean }) {
  const { isAuthenticated } = useAuth();
  const [points, setPoints] = useState<Point[]>([]);
  const pointsRef = useRef<Point[]>([]);

  // Live stats polled every 3s — always works if server is running
  const { data: live, isLoading } = trpc.servers.getLiveStats.useQuery(
    { serverId },
    { enabled: isAuthenticated, refetchInterval: 3000 }
  );

  // Historical from DB — used to seed on first load
  const { data: history = [] } = trpc.performance.getMetrics.useQuery(
    { serverId },
    { enabled: isAuthenticated, staleTime: 30000 }
  );

  // Seed from DB history once
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !history.length) return;
    seeded.current = true;
    const initial = history.slice(-40).map((m) => ({
      t: new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      cpu: m.cpu,
      ram: m.ram,
      tps: m.tps,
    }));
    pointsRef.current = initial;
    setPoints(initial);
  }, [history]);

  // Append live data to rolling window
  useEffect(() => {
    if (!live) return;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const next = [...pointsRef.current, { t: now, cpu: live.cpu, ram: live.ram, tps: 20 }].slice(-60);
    pointsRef.current = next;
    setPoints([...next]);
  }, [live]);

  const latest = live ?? (points.length ? { cpu: points[points.length - 1].cpu, ram: points[points.length - 1].ram } : null);
  const avg = (key: keyof Point) => points.length
    ? Math.round(points.reduce((s, p) => s + (p[key] as number), 0) / points.length)
    : 0;

  const statCards = [
    { label: "CPU", value: latest?.cpu ?? 0, avg: avg("cpu"), unit: "%", color: "text-blue-400", warn: latest && (latest.cpu as number) > 80 },
    { label: "RAM", value: latest?.ram ?? 0, avg: avg("ram"), unit: " MB", color: "text-purple-400" },
    { label: "TPS", value: points.length ? 20 : 0, avg: avg("tps"), unit: "", color: "text-green-400" },
    { label: "Samples", value: points.length, unit: "", color: "text-orange-400" },
  ];

  if (isLoading && !points.length) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1,2,3,4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(({ label, value, avg: average, unit, color, warn }) => (
          <Card key={label} className="stat-card">
            <CardContent className="p-0">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className={`text-2xl font-bold ${warn ? "text-destructive" : ""}`}>{value}{unit}</p>
              {average != null && average > 0 && <p className="text-xs text-muted-foreground mt-0.5">avg {average}{unit}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {!live && points.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="py-14 flex flex-col items-center gap-3 text-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isOnline ? "bg-green-500/10" : "bg-muted"}`}>
              <Activity className={`w-5 h-5 ${isOnline ? "text-green-500" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="font-medium">{isOnline ? "Collecting data..." : "Server is offline"}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isOnline ? "Metrics will appear shortly." : "Start the server to collect live performance data."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium">CPU Usage</span>
                </div>
                <Badge variant="outline" className="text-xs">{points.length} pts · live</Badge>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={points} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="cpuG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="t" stroke="#52525b" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis stroke="#52525b" tick={{ fontSize: 9 }} domain={[0, 100]} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuG)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium">RAM Usage (MB)</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={points} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="ramG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="t" stroke="#52525b" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis stroke="#52525b" tick={{ fontSize: 9 }} unit=" MB" />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="ram" stroke="#a855f7" fill="url(#ramG)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
