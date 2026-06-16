import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Server,
  Shield,
  Zap,
  BarChart3,
  Users,
  Terminal,
  Package,
  LogIn,
  UserPlus,
  ArrowRight,
  Globe,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password required"),
});

const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Min 6 characters"),
  name: z.string().min(1, "Name required"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

const features = [
  { icon: Server, title: "Multi-Server", desc: "Manage Java, Fabric & Bedrock" },
  { icon: Terminal, title: "Live Console", desc: "Real-time command execution" },
  { icon: BarChart3, title: "Performance", desc: "CPU, RAM & TPS monitoring" },
  { icon: Users, title: "Player Mgmt", desc: "Kick, ban, op players" },
  { icon: Package, title: "Plugin Mgmt", desc: "Upload & toggle plugins" },
  { icon: Shield, title: "Secure", desc: "Auth & role-based access" },
];

export default function Home() {
  const { user, loading, isAuthenticated, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [isRegistering, setIsRegistering] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => { toast.success("Welcome back!"); refresh(); setLocation("/dashboard"); },
    onError: (e) => toast.error(e.message),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => { toast.success("Account created!"); refresh(); setLocation("/dashboard"); },
    onError: (e) => toast.error(e.message),
  });

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema), defaultValues: { email: "", name: "", password: "" } });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (isAuthenticated) {
    setLocation("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b border-border/50 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Globe className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight">MC Server Manager</span>
        </div>
        <span className="text-xs text-muted-foreground">v2.0</span>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
        {/* Left */}
        <div className="space-y-10">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <Zap className="w-3 h-3" /> Full-Stack Minecraft Panel
            </div>
            <h1 className="text-4xl font-bold tracking-tight leading-tight">
              Manage your<br />
              <span className="text-accent">Minecraft servers</span><br />
              with ease
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed max-w-md">
              A complete management panel for Java, Bedrock & Fabric servers. Real-time monitoring, player control, and more.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
                <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Auth */}
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">{isRegistering ? "Create account" : "Sign in"}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isRegistering ? "Start managing your servers today" : "Welcome back, enter your credentials"}
              </p>
            </div>

            {isRegistering ? (
              <form onSubmit={registerForm.handleSubmit((d) => registerMutation.mutate(d))} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Name</Label>
                  <Input id="reg-name" placeholder="Your name" {...registerForm.register("name")} />
                  {registerForm.formState.errors.name && (
                    <p className="text-xs text-destructive">{registerForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" placeholder="you@example.com" {...registerForm.register("email")} />
                  {registerForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{registerForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input id="reg-password" type="password" placeholder="••••••••" {...registerForm.register("password")} />
                  {registerForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{registerForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full bg-accent text-white hover:bg-accent/90" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  Create account
                </Button>
              </form>
            ) : (
              <form onSubmit={loginForm.handleSubmit((d) => loginMutation.mutate(d))} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="you@example.com" {...loginForm.register("email")} />
                  {loginForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" type="password" placeholder="••••••••" {...loginForm.register("password")} />
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full bg-accent text-white hover:bg-accent/90" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogIn className="w-4 h-4 mr-2" />}
                  Sign in
                </Button>
              </form>
            )}

            <div className="my-5 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setIsRegistering(!isRegistering); loginForm.reset(); registerForm.reset(); }}
            >
              {isRegistering ? "Sign in to existing account" : "Create a new account"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
