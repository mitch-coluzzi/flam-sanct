"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function MemberDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const [todayFoods, setTodayFoods] = useState<any[]>([]);
  const [todayWorkouts, setTodayWorkouts] = useState<any[]>([]);
  const [recentResponses, setRecentResponses] = useState<any[]>([]);
  const [activeDirectives, setActiveDirectives] = useState<any[]>([]);
  const [weeklyAvg, setWeeklyAvg] = useState({ cal: 0, protein: 0, carbs: 0, fat: 0 });

  // New directive
  const [newDirective, setNewDirective] = useState("");
  const [savingDirective, setSavingDirective] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  useEffect(() => { if (id) load(); }, [id]);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Member profile (limited fields — name + F3 only)
    const { data: u } = await supabase.from("users").select("id, display_name, full_name, f3_name").eq("id", id).single();
    setMember(u);

    // Today's foods
    const { data: f } = await supabase
      .from("food_logs").select("*").eq("user_id", id).eq("log_date", today).order("created_at");
    setTodayFoods(f || []);

    // Today's workouts (for calorie burn context only)
    const { data: w } = await supabase
      .from("workouts").select("workout_type, duration_minutes, rpe, estimated_calories_burned, is_f3, f3_ao, workout_label")
      .eq("user_id", id).eq("log_date", today).order("created_at");
    setTodayWorkouts(w || []);

    // 7-day food averages
    const { data: weekFoods } = await supabase
      .from("food_logs").select("calories, protein_g, carbs_g, fat_g, log_date")
      .eq("user_id", id).gte("log_date", sevenAgo);
    const dates = new Set((weekFoods || []).map((f: any) => f.log_date));
    const dayCount = Math.max(dates.size, 1);
    setWeeklyAvg({
      cal: Math.round((weekFoods || []).reduce((s: number, f: any) => s + (f.calories || 0), 0) / dayCount),
      protein: Math.round((weekFoods || []).reduce((s: number, f: any) => s + (f.protein_g || 0), 0) / dayCount),
      carbs: Math.round((weekFoods || []).reduce((s: number, f: any) => s + (f.carbs_g || 0), 0) / dayCount),
      fat: Math.round((weekFoods || []).reduce((s: number, f: any) => s + (f.fat_g || 0), 0) / dayCount),
    });

    // Recent food responses (gut/energy reactions)
    const { data: resp } = await supabase
      .from("food_responses").select("*").eq("user_id", id)
      .gte("log_date", sevenAgo).order("symptom_at", { ascending: false }).limit(10);
    setRecentResponses(resp || []);

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
  const protein = todayFoods.reduce((s, f) => s + (f.protein_g || 0), 0);
  const carbs = todayFoods.reduce((s, f) => s + (f.carbs_g || 0), 0);
  const fat = todayFoods.reduce((s, f) => s + (f.fat_g || 0), 0);
  const pendingCount = todayFoods.filter((f) => f.photo_capture_status === "pending").length;

  return (
    <div className="p-8">
      <Link href="/members" className="text-dust hover:text-ember text-sm">← Back to Members</Link>

      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold text-parchment">{member.display_name || member.full_name}</h1>
        {member.f3_name && <span className="inline-block mt-2 text-xs bg-forge text-ember border border-ember px-2 py-1 rounded">F3: {member.f3_name}</span>}
      </header>

      {/* Today's Nutrition Summary */}
      <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xs font-bold text-ember uppercase tracking-widest">Today's Nutrition</h2>
          {pendingCount > 0 && (
            <Link href="/photos" className="bg-ember text-forge text-xs font-bold px-3 py-1 rounded">
              {pendingCount} pending review
            </Link>
          )}
        </div>
        <div className="grid grid-cols-5 gap-4 text-center">
          <div>
            <div className="text-3xl font-black text-parchment">{calIn}</div>
            <div className="text-xs text-dust mt-1">CAL IN</div>
          </div>
          <div>
            <div className="text-3xl font-black text-parchment">{calOut}</div>
            <div className="text-xs text-dust mt-1">CAL OUT</div>
          </div>
          <div>
            <div className="text-3xl font-black text-parchment">{Math.round(protein)}g</div>
            <div className="text-xs text-dust mt-1">PROTEIN</div>
          </div>
          <div>
            <div className="text-3xl font-black text-parchment">{Math.round(carbs)}g</div>
            <div className="text-xs text-dust mt-1">CARBS</div>
          </div>
          <div>
            <div className="text-3xl font-black text-parchment">{Math.round(fat)}g</div>
            <div className="text-xs text-dust mt-1">FAT</div>
          </div>
        </div>
      </div>

      {/* 7-Day Average */}
      <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
        <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">7-Day Average</h2>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div><span className="text-dust">Calories:</span> <span className="text-parchment font-bold">{weeklyAvg.cal}</span></div>
          <div><span className="text-dust">Protein:</span> <span className="text-parchment font-bold">{weeklyAvg.protein}g</span></div>
          <div><span className="text-dust">Carbs:</span> <span className="text-parchment font-bold">{weeklyAvg.carbs}g</span></div>
          <div><span className="text-dust">Fat:</span> <span className="text-parchment font-bold">{weeklyAvg.fat}g</span></div>
        </div>
      </div>

      {/* Today's Food Log */}
      <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
        <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Today's Food Log</h2>
        {todayFoods.length === 0 ? (
          <p className="text-dust text-sm italic">Nothing logged today.</p>
        ) : (
          <div className="space-y-3">
            {todayFoods.map((f) => (
              <div key={f.id} className="flex justify-between items-start py-3 border-b border-ash last:border-0">
                <div className="flex-1">
                  <div className="text-sm text-parchment font-semibold">{f.food_name}</div>
                  {f.narrative && <div className="text-xs text-dust italic mt-1">"{f.narrative}"</div>}
                  <div className="text-xs text-dust mt-1">
                    {f.meal_type} · {f.source}
                    {f.photo_capture_status === "pending" && <span className="text-ember ml-2">· pending</span>}
                  </div>
                </div>
                <div className="text-right ml-4">
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

      {/* Food Responses (gut + energy) */}
      <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
        <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Food Responses (last 7 days)</h2>
        {recentResponses.length === 0 ? (
          <p className="text-dust text-sm italic">No food responses logged.</p>
        ) : (
          <div className="space-y-2">
            {recentResponses.map((r) => (
              <div key={r.id} className="flex justify-between py-2 border-b border-ash last:border-0">
                <div className="flex-1">
                  <div className="text-sm text-parchment">
                    {r.log_date} · {r.meal_type}
                  </div>
                  <div className="text-xs text-dust mt-1">
                    {r.gut_response && <span className="mr-3">Gut: <span className="text-parchment">{r.gut_response}</span></span>}
                    {r.energy_response && <span>Energy: <span className="text-parchment">{r.energy_response}</span></span>}
                  </div>
                  {r.note && <div className="text-xs text-dust italic mt-1">"{r.note}"</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workouts (for calorie burn context only) */}
      <div className="bg-charcoal border border-slate rounded-xl p-6 mb-6">
        <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Today's Activity</h2>
        {todayWorkouts.length === 0 ? (
          <p className="text-dust text-sm italic">No workouts today.</p>
        ) : (
          todayWorkouts.map((w, i) => (
            <div key={i} className="py-2 border-b border-ash last:border-0">
              <div className="flex justify-between">
                <div className="text-sm text-parchment">
                  {w.is_f3 ? `F3 — ${w.f3_ao}` : w.workout_label || w.workout_type}
                </div>
                <div className="text-sm text-ember font-bold">~{w.estimated_calories_burned} cal</div>
              </div>
              <div className="text-xs text-dust mt-1">{w.duration_minutes}min · RPE {w.rpe}</div>
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
            placeholder="New directive (e.g. Add 30g more protein at lunch)..."
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
