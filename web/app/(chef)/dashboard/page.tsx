"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface MemberSummary {
  user_id: string;
  display_name: string;
  calories_in: number;
  calories_out: number;
  meals_logged: number;
  pending_photos: number;
  active_directives: number;
}

export default function DashboardPage() {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [directiveCount, setDirectiveCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const userId = session.user.id;

    const { data: assignments } = await supabase
      .from("chef_assignments")
      .select("member_id, member:users!chef_assignments_member_id_fkey(display_name, full_name)")
      .eq("chef_id", userId)
      .eq("active", true);

    const memberList: MemberSummary[] = [];
    let totalPending = 0;
    let totalDirectives = 0;

    for (const a of assignments || []) {
      const mid = a.member_id;
      const name = (a.member as any)?.display_name || (a.member as any)?.full_name || "Member";

      const { data: foods } = await supabase
        .from("food_logs")
        .select("calories, meal_type, photo_capture_status")
        .eq("user_id", mid)
        .eq("log_date", today);
      const calIn = (foods || []).reduce((s: number, f: any) => s + (f.calories || 0), 0);
      const meals = new Set((foods || []).map((f: any) => f.meal_type)).size;
      const pending = (foods || []).filter((f: any) => f.photo_capture_status === "pending").length;

      const { data: workouts } = await supabase
        .from("workouts")
        .select("estimated_calories_burned")
        .eq("user_id", mid)
        .eq("log_date", today);
      const calOut = (workouts || []).reduce((s: number, w: any) => s + (w.estimated_calories_burned || 0), 0);

      const { count: dirCount } = await supabase
        .from("dietary_directives")
        .select("id", { count: "exact", head: true })
        .eq("chef_id", userId)
        .eq("member_id", mid)
        .eq("is_active", true);

      memberList.push({
        user_id: mid,
        display_name: name,
        calories_in: calIn,
        calories_out: calOut,
        meals_logged: meals,
        pending_photos: pending,
        active_directives: dirCount || 0,
      });
      totalPending += pending;
      totalDirectives += dirCount || 0;
    }

    setMembers(memberList);
    setPendingCount(totalPending);
    setDirectiveCount(totalDirectives);
    setLoading(false);
  };

  if (loading) {
    return <div className="p-12 text-dust">Loading dashboard...</div>;
  }

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-parchment">Dashboard</h1>
        <p className="text-dust mt-1">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
      </header>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-charcoal border border-slate rounded-xl p-6">
          <div className="text-xs text-dust uppercase tracking-widest">Members</div>
          <div className="text-4xl font-black text-parchment mt-2">{members.length}</div>
          <div className="text-sm text-dust mt-1">assigned</div>
        </div>
        <Link href="/photos" className="bg-charcoal border border-slate rounded-xl p-6 hover:border-ember transition">
          <div className="text-xs text-dust uppercase tracking-widest">Photos</div>
          <div className="text-4xl font-black text-ember mt-2">{pendingCount}</div>
          <div className="text-sm text-dust mt-1">awaiting review</div>
        </Link>
        <Link href="/directives" className="bg-charcoal border border-slate rounded-xl p-6 hover:border-ember transition">
          <div className="text-xs text-dust uppercase tracking-widest">Directives</div>
          <div className="text-4xl font-black text-parchment mt-2">{directiveCount}</div>
          <div className="text-sm text-dust mt-1">active</div>
        </Link>
      </div>

      {/* Member list */}
      <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Your Members — Today</h2>
      <div className="space-y-3">
        {members.length === 0 ? (
          <div className="bg-charcoal border border-slate rounded-xl p-8 text-center text-dust">
            No members assigned yet.
          </div>
        ) : (
          members.map((m) => (
            <Link
              key={m.user_id}
              href={`/members/${m.user_id}`}
              className="block bg-charcoal border border-slate rounded-xl p-6 hover:border-ember transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-parchment">{m.display_name}</div>
                  <div className="flex gap-6 mt-2 text-sm text-dust">
                    <span><span className="text-parchment font-semibold">{m.calories_in}</span> in</span>
                    <span><span className="text-parchment font-semibold">{m.calories_out}</span> out</span>
                    <span><span className="text-parchment font-semibold">{m.meals_logged}</span> meals</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {m.pending_photos > 0 && (
                    <span className="bg-ember text-forge text-xs font-bold px-3 py-1 rounded-full">
                      {m.pending_photos} pending
                    </span>
                  )}
                  {m.active_directives > 0 && (
                    <span className="bg-ash text-ember text-xs font-bold px-3 py-1 rounded-full border border-ember">
                      {m.active_directives} directive{m.active_directives > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
