import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAdminLogin } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const adminLogin = useAdminLogin();

  useEffect(() => {
    if (isAuthenticated && user?.role === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    adminLogin.mutate(
      { data },
      {
        onSuccess: (res) => { login(res.user); },
        onError: (error) => {
          toast({ title: "Login failed", description: error.message || "Invalid credentials", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: "#060610",
        backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">

          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 25px 80px rgba(0,0,0,0.5)" }}
          >
            {/* Header */}
            <div className="px-8 pt-8 pb-6 text-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
                style={{ background: "rgba(79,70,229,0.15)", border: "1px solid rgba(79,70,229,0.4)", boxShadow: "0 0 40px rgba(79,70,229,0.2)" }}
              >
                <ShieldCheck className="h-6 w-6" style={{ color: "#818cf8" }} />
              </div>
              <h1 className="text-2xl font-black text-white mb-1" style={{ fontFamily: "'Space Mono', monospace" }}>
                Admin Console
              </h1>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
                Platform Administration
              </p>
            </div>

            {/* Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="px-8 pt-6 space-y-4">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: "rgba(255,255,255,0.45)", fontFamily: "'Space Mono', monospace" }}>
                        Email
                      </label>
                      <FormControl>
                        <input
                          type="email"
                          placeholder="admin@example.com"
                          {...field}
                          data-testid="input-email"
                          className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                          style={{ background: "#0d0d18", border: "1px solid rgba(255,255,255,0.08)" }}
                          onFocus={e => (e.currentTarget.style.borderColor = "rgba(79,70,229,0.5)")}
                          onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" style={{ color: "#f87171" }} />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: "rgba(255,255,255,0.45)", fontFamily: "'Space Mono', monospace" }}>
                        Password
                      </label>
                      <FormControl>
                        <input
                          type="password"
                          placeholder="••••••••"
                          {...field}
                          data-testid="input-password"
                          className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                          style={{ background: "#0d0d18", border: "1px solid rgba(255,255,255,0.08)" }}
                          onFocus={e => (e.currentTarget.style.borderColor = "rgba(79,70,229,0.5)")}
                          onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" style={{ color: "#f87171" }} />
                    </FormItem>
                  )} />
                </div>

                <div className="px-8 pt-5 pb-8">
                  <button
                    type="submit"
                    disabled={adminLogin.isPending}
                    data-testid="button-submit"
                    className="w-full py-3.5 rounded-xl font-black text-sm transition-all hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #4F46E5, #7c3aed)",
                      color: "white",
                      fontFamily: "'Space Mono', monospace",
                      boxShadow: "0 0 30px rgba(79,70,229,0.3)",
                    }}
                  >
                    {adminLogin.isPending ? "Signing in..." : "Sign In"}
                  </button>
                </div>
              </form>
            </Form>
          </div>

          <p className="text-center text-xs mt-6" style={{ color: "rgba(255,255,255,0.2)" }}>
            AI Gateway · Admin Portal
          </p>
        </div>
      </div>
    </div>
  );
}
