"use client";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const API_BASE = "https://api.flamsanct.com/v1";

export default function MemberDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<any>(null);
  const [chefId, setChefId] = useState<string | null>(null);

  // Nutrition + workout data
  const [todayFoods, setTodayFoods] = useState<any[]>([]);
  const [todayWorkouts, setTodayWorkouts] = useState<any[]>([]);
  const [recentResponses, setRecentResponses] = useState<any[]>([]);
  const [activeDirectives, setActiveDirectives] = useState<any[]>([]);
  const [weeklyAvg, setWeeklyAvg] = useState({ cal: 0, protein: 0, carbs: 0, fat: 0 });

  // Weight history
  const [weightHistory, setWeightHistory] = useState<{ date: string; weight: number }[]>([]);

  // Conversation
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Directive
  const [newDirective, setNewDirective] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const ninetyAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

  useEffect(() => { if (id) load(); }, [id]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Real-time subscription on the conversation
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => loadMessages(conversationId),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setChefId(session.user.id);

    const { data: u } = await supabase.from("users").select("id, display_name, full_name, f3_name").eq("id", id).single();
    setMember(u);

    // Today's foods
    const { data: f } = await supabase
      .from("food_logs").select("*").eq("user_id", id).eq("log_date", today).order("created_at");
    setTodayFoods(f || []);

    // Today's workouts
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

    // Weight history (90 days)
    const { data: weights } = await supabase
      .from("daily_logs").select("log_date, weight_lbs")
      .eq("user_id", id).gte("log_date", ninetyAgo).not("weight_lbs", "is", null).order("log_date");
    setWeightHistory((weights || []).map((d: any) => ({ date: d.log_date, weight: d.weight_lbs })));

    // Food responses
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

    // Find or create conversation between chef and this member
    const { data: parts } = await supabase
      .from("conversation_participants").select("conversation_id").eq("user_id", session.user.id);
    const myConvIds = (parts || []).map((p: any) => p.conversation_id);
    if (myConvIds.length > 0) {
      const { data: theirParts } = await supabase
        .from("conversation_participants").select("conversation_id").eq("user_id", id).in("conversation_id", myConvIds);
      if (theirParts && theirParts.length > 0) {
        const cid = theirParts[0].conversation_id;
        setConversationId(cid);
        await loadMessages(cid);
      }
    }

    setLoading(false);
  };

  const loadMessages = async (cid: string) => {
    const { data } = await supabase
      .from("messages").select("*, sender:users!messages_sender_id_fkey(display_name, full_name, role)")
      .eq("conversation_id", cid).is("deleted_at", null).order("created_at");
    setMessages(data || []);
  };

  const sendMessage = async () => {
    if (!conversationId || !chefId || !newMessage.trim()) return;
    setSending(true);
    const text = newMessage.trim();
    setNewMessage("");

    // Insert chef message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: chefId,
      body: text,
      message_type: "text",
    });
    await loadMessages(conversationId);
    setSending(false);

    // Check for @ai mention
    if (text.toLowerCase().includes("@ai")) {
      setAiThinking(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(`${API_BASE}/messages/conversations/${conversationId}/summon-ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ prompt: text, member_id: id }),
        });
        await loadMessages(conversationId);
      } catch (e) {
        console.error(e);
      }
      setAiThinking(false);
    }
  };

  const addDirective = async () => {
    if (!newDirective.trim() || !chefId) return;
    await supabase.from("dietary_directives").insert({
      member_id: id, chef_id: chefId,
      issued_by: "admin", directive_text: newDirective.trim(),
      is_active: true,
    });
    setNewDirective("");
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

  // Weight trend
  const wStart = weightHistory.length > 0 ? weightHistory[0].weight : null;
  const wCurrent = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].weight : null;
  const wDelta = wStart && wCurrent ? (wCurrent - wStart).toFixed(1) : null;
  const wTrend = wDelta && parseFloat(wDelta) < -0.5 ? "declining" : wDelta && parseFloat(wDelta) > 0.5 ? "increasing" : "flat";

  // Simple sparkline for weight
  const weightChart = () => {
    if (weightHistory.length < 2) return null;
    const max = Math.max(...weightHistory.map((w) => w.weight));
    const min = Math.min(...weightHistory.map((w) => w.weight));
    const range = max - min || 1;
    const width = 300;
    const height = 60;
    const points = weightHistory.map((w, i) => {
      const x = (i / (weightHistory.length - 1)) * width;
      const y = height - ((w.weight - min) / range) * height;
      return `${x},${y}`;
    }).join(" ");
    return (
      <svg width={width} height={height} className="mt-2">
        <polyline fill="none" stroke="#C0632A" strokeWidth="2" points={points} />
      </svg>
    );
  };

  return (
    <div className="p-8">
      <Link href="/members" className="text-dust hover:text-ember text-sm">← Back to Members</Link>

      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold text-parchment">{member.display_name || member.full_name}</h1>
        {member.f3_name && <span className="inline-block mt-2 text-xs bg-forge text-ember border border-ember px-2 py-1 rounded">F3: {member.f3_name}</span>}
      </header>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column — data */}
        <div className="col-span-2 space-y-6">
          {/* Today's Nutrition */}
          <div className="bg-charcoal border border-slate rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-bold text-ember uppercase tracking-widest">Today's Nutrition</h2>
              {pendingCount > 0 && <Link href="/photos" className="bg-ember text-forge text-xs font-bold px-3 py-1 rounded">{pendingCount} pending</Link>}
            </div>
            <div className="grid grid-cols-5 gap-4 text-center">
              <div><div className="text-3xl font-black text-parchment">{calIn}</div><div className="text-xs text-dust mt-1">CAL IN</div></div>
              <div><div className="text-3xl font-black text-parchment">{calOut}</div><div className="text-xs text-dust mt-1">CAL OUT</div></div>
              <div><div className="text-3xl font-black text-parchment">{Math.round(protein)}g</div><div className="text-xs text-dust mt-1">PROTEIN</div></div>
              <div><div className="text-3xl font-black text-parchment">{Math.round(carbs)}g</div><div className="text-xs text-dust mt-1">CARBS</div></div>
              <div><div className="text-3xl font-black text-parchment">{Math.round(fat)}g</div><div className="text-xs text-dust mt-1">FAT</div></div>
            </div>
          </div>

          {/* Weight Trend */}
          <div className="bg-charcoal border border-slate rounded-xl p-6">
            <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Weight Trend (90 days)</h2>
            {weightHistory.length < 2 ? (
              <p className="text-dust text-sm italic">Not enough data yet.</p>
            ) : (
              <>
                <div className="flex gap-8 items-center">
                  <div><div className="text-2xl font-black text-parchment">{wCurrent}</div><div className="text-xs text-dust">CURRENT</div></div>
                  <div><div className="text-2xl font-black text-parchment">{wStart}</div><div className="text-xs text-dust">START</div></div>
                  <div>
                    <div className={`text-2xl font-black ${parseFloat(wDelta!) < 0 ? "text-ember" : "text-parchment"}`}>
                      {parseFloat(wDelta!) > 0 ? "+" : ""}{wDelta}
                    </div>
                    <div className="text-xs text-dust">{wTrend.toUpperCase()}</div>
                  </div>
                </div>
                {weightChart()}
              </>
            )}
          </div>

          {/* 7-Day Average */}
          <div className="bg-charcoal border border-slate rounded-xl p-6">
            <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">7-Day Average</h2>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div><span className="text-dust">Calories:</span> <span className="text-parchment font-bold">{weeklyAvg.cal}</span></div>
              <div><span className="text-dust">Protein:</span> <span className="text-parchment font-bold">{weeklyAvg.protein}g</span></div>
              <div><span className="text-dust">Carbs:</span> <span className="text-parchment font-bold">{weeklyAvg.carbs}g</span></div>
              <div><span className="text-dust">Fat:</span> <span className="text-parchment font-bold">{weeklyAvg.fat}g</span></div>
            </div>
          </div>

          {/* Today's Food Log */}
          <div className="bg-charcoal border border-slate rounded-xl p-6">
            <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Today's Food Log</h2>
            {todayFoods.length === 0 ? <p className="text-dust text-sm italic">Nothing logged today.</p> : (
              <div className="space-y-3">
                {todayFoods.map((f) => (
                  <div key={f.id} className="flex justify-between items-start py-3 border-b border-ash last:border-0">
                    <div className="flex-1">
                      <div className="text-sm text-parchment font-semibold">{f.food_name}</div>
                      {f.narrative && <div className="text-xs text-dust italic mt-1">"{f.narrative}"</div>}
                      <div className="text-xs text-dust mt-1">{f.meal_type} · {f.source}{f.photo_capture_status === "pending" && <span className="text-ember ml-2">· pending</span>}</div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-sm text-ember font-bold">{f.calories || "—"} cal</div>
                      {(f.protein_g || f.carbs_g || f.fat_g) && <div className="text-xs text-dust">P {f.protein_g || 0}g · C {f.carbs_g || 0}g · F {f.fat_g || 0}g</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Food Responses */}
          <div className="bg-charcoal border border-slate rounded-xl p-6">
            <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Food Responses (7 days)</h2>
            {recentResponses.length === 0 ? <p className="text-dust text-sm italic">No food responses logged.</p> : (
              <div className="space-y-2">
                {recentResponses.map((r) => (
                  <div key={r.id} className="py-2 border-b border-ash last:border-0">
                    <div className="text-sm text-parchment">{r.log_date} · {r.meal_type}</div>
                    <div className="text-xs text-dust mt-1">
                      {r.gut_response && <span className="mr-3">Gut: <span className="text-parchment">{r.gut_response}</span></span>}
                      {r.energy_response && <span>Energy: <span className="text-parchment">{r.energy_response}</span></span>}
                    </div>
                    {r.note && <div className="text-xs text-dust italic mt-1">"{r.note}"</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Today's Activity */}
          <div className="bg-charcoal border border-slate rounded-xl p-6">
            <h2 className="text-xs font-bold text-ember uppercase tracking-widest mb-4">Today's Activity</h2>
            {todayWorkouts.length === 0 ? <p className="text-dust text-sm italic">No workouts today.</p> : (
              todayWorkouts.map((w, i) => (
                <div key={i} className="py-2 border-b border-ash last:border-0">
                  <div className="flex justify-between">
                    <div className="text-sm text-parchment">{w.is_f3 ? `F3 — ${w.f3_ao}` : w.workout_label || w.workout_type}</div>
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
            {activeDirectives.length === 0 && <p className="text-dust text-sm italic mb-4">No active directives.</p>}
            {activeDirectives.map((d) => (
              <div key={d.id} className="bg-forge border border-ash rounded-lg p-4 mb-3">
                <p className="text-sm text-parchment">{d.directive_text}</p>
                <div className="text-xs text-dust mt-2">{d.issued_by}</div>
              </div>
            ))}
            <div className="mt-4 flex gap-2">
              <input type="text" value={newDirective} onChange={(e) => setNewDirective(e.target.value)} placeholder="New directive..." className="flex-1 bg-forge border border-slate rounded-lg px-3 py-2 text-parchment focus:border-ember outline-none" />
              <button onClick={addDirective} disabled={!newDirective.trim()} className="bg-ember text-forge font-bold px-4 rounded-lg hover:bg-flame transition disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>

        {/* Right column — conversation */}
        <div className="col-span-1">
          <div className="bg-charcoal border border-slate rounded-xl flex flex-col" style={{ height: "calc(100vh - 200px)", position: "sticky", top: "1rem" }}>
            <div className="p-4 border-b border-ash">
              <h2 className="text-xs font-bold text-ember uppercase tracking-widest">Conversation</h2>
              <p className="text-xs text-dust mt-1">Tag <span className="text-ember">@ai</span> to summon insights</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!conversationId && <p className="text-dust text-sm italic text-center">No conversation yet.</p>}
              {messages.map((m) => {
                const isAi = m.message_type === "ai_digest";
                const isMine = m.sender_id === chefId && !isAi;
                const senderRole = (m.sender as any)?.role || "user";
                const senderName = isAi ? "FlamSanct AI" : (m.sender as any)?.display_name || (m.sender as any)?.full_name || "User";

                return (
                  <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] ${isMine ? "items-end" : "items-start"}`}>
                      <div className={`text-xs mb-1 ${isMine ? "text-right text-dust" : isAi ? "text-ember font-bold" : "text-parchment font-semibold"}`}>
                        {isMine ? "You" : senderName}{isAi && " ✦"}
                      </div>
                      <div className={`rounded-lg px-3 py-2 text-sm ${
                        isMine ? "bg-ember text-forge" :
                        isAi ? "bg-forge border border-ember text-parchment" :
                        "bg-ash text-parchment"
                      }`}>
                        {m.body}
                      </div>
                      {isAi && m.ai_key_points && m.ai_key_points.length > 0 && (
                        <div className="mt-2 bg-forge border border-ash rounded-lg p-2">
                          <div className="text-xs text-ember font-bold uppercase tracking-widest mb-1">Key Points</div>
                          {m.ai_key_points.map((kp: string, i: number) => (
                            <div key={i} className="text-xs text-parchment py-0.5">• {kp}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {aiThinking && (
                <div className="flex justify-start">
                  <div className="bg-forge border border-ember rounded-lg px-3 py-2 text-sm text-ember italic">
                    AI thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {conversationId && (
              <div className="p-4 border-t border-ash">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                    placeholder="Message... or @ai for insight"
                    className="flex-1 bg-forge border border-slate rounded-lg px-3 py-2 text-sm text-parchment focus:border-ember outline-none"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !newMessage.trim()}
                    className="bg-ember text-forge font-bold px-4 rounded-lg hover:bg-flame transition disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
