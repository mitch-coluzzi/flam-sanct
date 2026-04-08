"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▣" },
  { href: "/members", label: "Members", icon: "◉" },
  { href: "/photos", label: "Photo Review", icon: "◈" },
  { href: "/recipes", label: "Recipes", icon: "▤" },
  { href: "/directives", label: "Directives", icon: "◆" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (!data || (data.role !== "chef" && data.role !== "admin")) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }
      setProfile(data);
      setLoading(false);
    });
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-dust">Loading...</div>;
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-charcoal border-r border-ash flex flex-col">
        <div className="p-6 border-b border-ash">
          <h1 className="text-2xl font-black text-ember tracking-tight">FLAM SANCT</h1>
          <p className="text-xs text-dust uppercase tracking-widest mt-1">Chef</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  active ? "bg-ember text-forge font-semibold" : "text-dust hover:bg-ash hover:text-parchment"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-ash">
          <div className="text-sm text-parchment font-semibold">{profile?.display_name || profile?.full_name}</div>
          <div className="text-xs text-dust">{profile?.email}</div>
          <button
            onClick={signOut}
            className="text-xs text-dust hover:text-ember mt-2"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
