"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Verify user is chef or admin
    if (data.user) {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (!profile || (profile.role !== "chef" && profile.role !== "admin")) {
        setError("Chef or admin access required.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
    }

    router.replace("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black text-ember tracking-tight">FLAM SANCT</h1>
          <p className="text-dust italic text-sm mt-2">Chef Interface</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-charcoal text-parchment border border-slate rounded-lg px-4 py-3 focus:border-ember focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-charcoal text-parchment border border-slate rounded-lg px-4 py-3 focus:border-ember focus:outline-none"
            />
          </div>

          {error && (
            <div className="bg-crisis/20 border border-crisis rounded-lg p-3 text-sm text-parchment">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ember text-forge font-bold py-3 rounded-lg hover:bg-flame transition disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
