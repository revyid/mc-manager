import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Copy, Trash2, Circle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ConsoleMessage {
  id: string;
  timestamp: Date;
  type: "input" | "output" | "system";
  content: string;
}

function colorizeLog(line: string): { text: string; className: string } {
  if (line.includes("[ERROR]") || line.includes("ERROR") || line.includes("Exception")) return { text: line, className: "text-red-400" };
  if (line.includes("[WARN]") || line.includes("WARN")) return { text: line, className: "text-yellow-400" };
  if (line.includes("[INFO]") || line.includes("joined") || line.includes("left")) return { text: line, className: "text-zinc-300" };
  if (line.includes("Done") || line.includes("started")) return { text: line, className: "text-green-400" };
  return { text: line, className: "text-zinc-400" };
}

export default function ServerConsole({ serverId }: { serverId: number }) {
  const { isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<ConsoleMessage[]>([
    { id: "1", timestamp: new Date(), type: "system", content: "Console ready. Waiting for server output…" },
  ]);
  const [input, setInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastLogRef = useRef<string>("");

  const { data: logData } = trpc.servers.getLogs.useQuery(
    { serverId },
    { enabled: isAuthenticated && !!serverId, refetchInterval: 1000 }
  );

  useEffect(() => {
    if (!logData?.logs) return;
    const hash = logData.logs.join("\n");
    if (hash === lastLogRef.current) return;
    lastLogRef.current = hash;

    if (logData.logs.length === 0) {
      setMessages([{ id: "reset", timestamp: new Date(), type: "system", content: "Buffer cleared." }]);
      return;
    }

    const formatted = logData.logs.map((line, i) => ({
      id: `log-${i}`,
      timestamp: new Date(),
      type: "output" as const,
      content: line.trim(),
    }));
    setMessages((prev) => [...prev.filter((m) => m.type !== "output"), ...formatted]);
  }, [logData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const executeMutation = trpc.servers.executeCommand.useMutation();

  const handleSend = async () => {
    if (!input.trim()) return;
    const cmd = input.trim();
    setMessages((prev) => [...prev, { id: Date.now().toString(), timestamp: new Date(), type: "input", content: `> ${cmd}` }]);
    setCommandHistory((prev) => [cmd, ...prev]);
    setHistoryIndex(-1);
    setInput("");
    try {
      await executeMutation.mutateAsync({ serverId, command: cmd });
    } catch (e: any) {
      setMessages((prev) => [...prev, { id: Date.now().toString(), timestamp: new Date(), type: "system", content: `Error: ${e.message}` }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleSend(); }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      const newIdx = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(newIdx);
      if (commandHistory[newIdx]) setInput(commandHistory[newIdx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const newIdx = historyIndex - 1;
      if (newIdx < 0) { setHistoryIndex(-1); setInput(""); }
      else { setHistoryIndex(newIdx); setInput(commandHistory[newIdx]); }
    }
  };

  return (
    <div className="space-y-3 h-[calc(100vh-280px)] min-h-[400px] flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Circle className="w-2.5 h-2.5 fill-green-500 text-green-500" />
          <span className="text-sm font-medium">Console</span>
          <Badge variant="outline" className="text-xs">{messages.filter((m) => m.type === "output").length} lines</Badge>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => { navigator.clipboard.writeText(messages.map((m) => m.content).join("\n")); toast.success("Copied!"); }}>
            <Copy className="w-3 h-3" /> Copy
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setMessages([{ id: "c", timestamp: new Date(), type: "system", content: "Cleared." }])}>
            <Trash2 className="w-3 h-3" /> Clear
          </Button>
        </div>
      </div>

      {/* Console output */}
      <Card className="flex-1 overflow-hidden rounded-xl border border-border bg-[#0d0d0f]">
        <div className="h-full overflow-y-auto p-4 space-y-0.5 scrollbar-thin">
          {messages.map((msg) => {
            if (msg.type === "input") {
              return (
                <div key={msg.id} className="console-line text-accent font-semibold">
                  <span className="text-zinc-600 select-none">{msg.timestamp.toLocaleTimeString()} </span>
                  {msg.content}
                </div>
              );
            }
            if (msg.type === "system") {
              return (
                <div key={msg.id} className="console-line text-yellow-500/80 italic">
                  <span className="text-zinc-600 select-none">{msg.timestamp.toLocaleTimeString()} </span>
                  {msg.content}
                </div>
              );
            }
            const { className } = colorizeLog(msg.content);
            return (
              <div key={msg.id} className={`console-line ${className}`}>
                {msg.content}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </Card>

      {/* Input */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-card px-3 focus-within:ring-1 focus-within:ring-accent/50 focus-within:border-accent/50 transition-all">
          <span className="text-accent text-sm font-mono select-none">{'>'}</span>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command… (↑↓ history)"
            className="border-0 bg-transparent font-mono text-sm p-0 h-9 focus-visible:ring-0"
            disabled={executeMutation.isPending}
          />
        </div>
        <Button
          onClick={handleSend}
          disabled={executeMutation.isPending || !input.trim()}
          className="bg-accent text-white hover:bg-accent/90 h-[42px] px-4"
        >
          {executeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {/* History chips */}
      {commandHistory.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {commandHistory.slice(0, 8).map((cmd, i) => (
            <button
              key={i}
              onClick={() => setInput(cmd)}
              className="px-2 py-0.5 text-xs rounded-md border border-border bg-muted hover:bg-muted/80 font-mono transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
