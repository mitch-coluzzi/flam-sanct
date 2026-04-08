"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.from("users").select("*").eq("id", session.user.id).single();
    setProfile(data);
    setDisplayName(data?.display_name || "");
    setFullName(data?.full_name || "");
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    await supabase.from("users").update({
      display_name: displayName.trim() || null,
      full_name: fullName.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", profile.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  };

  const signOut = async () => {
    if (!confirm("Sign out?")) return;
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (!profile) return <div className="p-12 text-dust">Loading...</div>;

  return (
    <div className="p-8 max-w-2xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-parchment">Settings</h1>
      </header>

      <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
        <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Profile</h2>

        <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full bg-forge text-parchment border border-slate rounded-lg px-4 py-3 focus:border-ember focus:outline-none mb-4"
        />

        <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">
          Full Name
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full bg-forge text-parchment border border-slate rounded-lg px-4 py-3 focus:border-ember focus:outline-none mb-4"
        />

        <button
          onClick={save}
          disabled={saving}
          className="bg-ember text-forge font-bold py-3 px-6 rounded-lg hover:bg-flame transition disabled:opacity-50"
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save Changes"}
        </button>
      </div>

      <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
        <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-dust">Email</span>
            <span className="text-parchment">{profile.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dust">Role</span>
            <span className="text-parchment uppercase font-bold">{profile.role}</span>
          </div>
        </div>
      </div>

      <button
        onClick={signOut}
        className="text-dust hover:text-parchment text-sm"
      >
        Sign out
      </button>
    </div>
  );
}
