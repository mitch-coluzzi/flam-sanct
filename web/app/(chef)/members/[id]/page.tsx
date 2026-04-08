"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const MOOD_LABELS: Record<number, string> = {
  [-4]: "Crisis", [-3]: "Struggling", [-2]: "Low", [-1]: "Flat",
  [0]: "Neutral", [1]: "Steady", [2]: "Solid", [3]: "Strong", [4]: "Peak",
};

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const [days, setDays] = useState<any[]>([]);
  const [todayLog, setTodayLog] = useState<any>(null);
  const [todayWorkouts, setTodayWorkouts] = useState<any[]>([]);
  const [todayFoods, setTodayFoods] = useState<any[]>([]);
  const [activeDirectives, setActiveDirectives] = useState<any[]>([]);

  // New directive
  const [newDirective, setNewDirective] = useState("");
  const [savingDirective, setSavingDirective] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => { if (id) load(); }, [id]);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Member profile
    const { data: u } = await supabase.from("users").select("*").eq("id", id).single();
    setMember(u);

    // Last 14 days of daily logs
    const fourteenAgo = new Date();
    fourteenAgo.setDate(fourteenAgo.getDate() - 14);
    const { data: logs } = await supabase
      .from("daily_logs")
      .select("*")
      .eq("user_id", id)
      .gte("log_date", fourteenAgo.toISOString().split("T")[0])
      .order("log_date", { ascending: false });
    setDays(logs || []);

    setTodayLog((logs || []).find((l) => l.log_date === today) || null);

    // Today's workouts
    const { data: w } = await supabase
      .from("workouts").select("*").eq("user_id", id).eq("log_date", today).order("created_at");
    setTodayWorkouts(w || []);

    // Today's foods
    const { data: f } = await supabase
      .from("food_logs").select("*").eq("user_id", id).eq("log_date", today).order("created_at");
    setTodayFoods(f || []);

    // Active directives
    const { data: d } = await supabase
      .from("dietary_directives").select("*")
      .eq("member_id", id).eq("chef_id", session.user.id).eq("is_active", true)
      .order("created_at", { ascending: false });
    setActiveDirectives(d || []);

    setLoading(false);
  };

  const addDirective = async () => {
    if (!newDirective.trim()) return;
    setSavingDirective(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("dietary_directives").insert({
      member_id: id, chef_id: session.user.id,
      issued_by: "admin", directive_text: newDirective.trim(),
      is_active: true,
    });
    setNewDirective("");
    setSavingDirective(false);
    load();
  };

  if (loading) return <div className="p-12 text-dust">Loading member...</div>;
  if (!member) return <div className="p-12 text-dust">Member not found.</div>;

  const calIn = todayFoods.reduce((s, f) => s + (f.calories || 0), 0);
  const calOut = todayWorkouts.reduce((s, w) => s + (w.estimated_calories_burned || 0), 0);
  const pendingCount = todayFoods.filter((f) => f.photo_capture_status === "pending").length;

  // 14-day stats
  const avgSleep = days.length > 0 ? (days.filter(d => d.sleep_hours).reduce((s, d) => s + d.sleep_hours, 0) / Math.max(days.filter(d => d.sleep_hours).length, 1)).toFixed(1) : "—";
  const avgMood = days.length > 0 && days.filter(d => d.mood !== null).length > 0
    ? (days.filter(d => d.mood !== null).reduce((s, d) => s + d.mood, 0) / days.filter(d => d.mood !== null).length).toFixed(1) : "—";

  return (
    <div className="p-8">
      <Link href="/members" className="text-dust hover:text-ember text-sm">← Back to Members</Link>

      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold text-parchment">{member.display_name || member.full_name}</h1>
        <p className="text-dust mt-1">{member.email}</p>
        {member.f3_name && <span className="inline-block mt-2 text-xs bg-forge text-ember border border-ember px-2 py-1 rounded">F3: {member.f3_name}</span>}
      </header>

      {/* 14-day stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-charcoal border border-slate rounded-xl p-4">
          <div className="text-xs text-dust uppercase tracking-widest">Avg Sleep</div>
          <div className="text-2xl font-black text-parchment mt-1">{avgSleep}h</div>
        </div>
        <div className="bg-charcoal border border-slate rounded-xl p-4">
          <div className="text-xs text-dust uppercase tracking-widest">Avg Mood (14d)</div>
          <div className="text-2xl font-black text-parchment mt-1">{avgMood}</div>
        </div>
        <div className="bg-charcoal border border-slate rounded-xl p-4">
          <div className="text-xs text-dust uppercase tracking-widest">Today In</div>
          <div className="text-2xl font-black text-parchment mt-1">{calIn}</div>
        </div>
        <div className="bg-charcoal border border-slate rounded-xl p-4">
          <div className="text-xs text-dust uppercase tracking-widest">Today Net</div>
          <div className="text-2xl font-black text-ember mt-1">{calIn - calOut}</div>
        </div>
      </div>

      {/* Today's check-in */}
      {todayLog && (
        <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
          <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Today's Check-In</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {todayLog.sleep_hours && <div><span className="text-dust">Sleep:</span> <span className="text-parchment">{todayLog.sleep_hours}h</span></div>}
            {todayLog.mood !== null && <div><span className="text-dust">AM Mood:</span> <span className="text-parchment">{MOOD_LABELS[todayLog.mood]}</span></div>}
            {todayLog.evening_mood !== null && <div><span className="text-dust">PM Mood:</span> <span className="text-parchment">{MOOD_LABELS[todayLog.evening_mood]}</span></div>}
            {todayLog.weight_lbs && <div><span className="text-dust">Weight:</span> <span className="text-parchment">{todayLog.weight_lbs} lbs</span></div>}
            {todayLog.life_event && <div className="col-span-2"><span className="text-dust">📌 {todayLog.life_event}</span> {todayLog.life_event_note && <span className="text-parchment">— {todayLog.life_event_note}</span>}</div>}
          </div>
          {todayLog.am_reflection && <div className="mt-4 pt-4 border-t border-ash"><div className="text-xs text-dust uppercase tracking-widest mb-1">AM Reflection</div><p className="text-sm text-parchment italic">"{todayLog.am_reflection}"</p></div>}
          {todayLog.pm_reflection && <div className="mt-4 pt-4 border-t border-ash"><div className="text-xs text-dust uppercase tracking-widest mb-1">PM Reflection</div><p className="text-sm text-parchment italic">"{todayLog.pm_reflection}"</p></div>}
          {todayLog.journal_note && <div className="mt-4 pt-4 border-t border-ash"><div className="text-xs text-dust uppercase tracking-widest mb-1">Journal</div><p className="text-sm text-parchment">{todayLog.journal_note}</p></div>}
        </div>
      )}

      {/* Nutrition */}
      <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xs font-bold text-ember uppercase tracking-widest">Today's Food</h2>
          {pendingCount > 0 && <span className="bg-ember text-forge text-xs font-bold px-2 py-1 rounded">{pendingCount} pending</span>}
        </div>
        {todayFoods.length === 0 ? (
          <p className="text-dust text-sm italic">Nothing logged today.</p>
        ) : (
          <div className="space-y-2">
            {todayFoods.map((f) => (
              <div key={f.id} className="flex justify-between items-start py-2 border-b border-ash last:border-0">
                <div className="flex-1">
                  <div className="text-sm text-parchment font-semibold">{f.food_name}</div>
                  {f.narrative && <div className="text-xs text-dust italic">"{f.narrative}"</div>}
                  <div className="text-xs text-dust mt-1">{f.meal_type} · {f.source}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-ember font-bold">{f.calories || "—"} cal</div>
                  {(f.protein_g || f.carbs_g || f.fat_g) && (
                    <div className="text-xs text-dust">P {f.protein_g || 0}g · C {f.carbs_g || 0}g · F {f.fat_g || 0}g</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workouts */}
      <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
        <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Today's Workouts</h2>
        {todayWorkouts.length === 0 ? (
          <p className="text-dust text-sm italic">No workouts today.</p>
        ) : (
          todayWorkouts.map((w) => (
            <div key={w.id} className="py-2 border-b border-ash last:border-0">
              <div className="text-sm text-parchment font-semibold">{w.is_f3 ? `F3 — ${w.f3_ao}` : w.workout_label || w.workout_type}</div>
              <div className="text-xs text-dust mt-1">{w.duration_minutes}min · RPE {w.rpe} · ~{w.estimated_calories_burned} cal</div>
            </div>
          ))
        )}
      </div>

      {/* Directives */}
      <div className="bg-charcoal border border-slate rounded-xl p-6">
        <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Dietary Directives</h2>
        {activeDirectives.length === 0 && (
          <p className="text-dust text-sm italic mb-4">No active directives.</p>
        )}
        {activeDirectives.map((d) => (
          <div key={d.id} className="bg-forge border border-ash rounded-lg p-4 mb-3">
            <p className="text-sm text-parchment">{d.directive_text}</p>
            <div className="text-xs text-dust mt-2">{d.issued_by}</div>
          </div>
        ))}
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={newDirective}
            onChange={(e) => setNewDirective(e.target.value)}
            placeholder="New directive..."
            className="flex-1 bg-forge border border-slate rounded-lg px-3 py-2 text-parchment focus:border-ember outline-none"
          />
          <button
            onClick={addDirective}
            disabled={savingDirective || !newDirective.trim()}
            className="bg-ember text-forge font-bold px-4 rounded-lg hover:bg-flame transition disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
