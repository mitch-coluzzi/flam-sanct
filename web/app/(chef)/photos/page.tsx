"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface PendingPhoto {
  id: string;
  food_name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  photo_url: string | null;
  ai_portion_estimate: string | null;
  narrative: string | null;
  meal_type: string;
  log_date: string;
  user_id: string;
  member_name: string;
}

export default function PhotosPage() {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PendingPhoto | null>(null);
  const [editName, setEditName] = useState("");
  const [editCal, setEditCal] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCarbs, setEditCarbs] = useState("");
  const [editFat, setEditFat] = useState("");

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: assignments } = await supabase
      .from("chef_assignments")
      .select("member_id, member:users!chef_assignments_member_id_fkey(display_name, full_name)")
      .eq("chef_id", session.user.id)
      .eq("active", true);

    const memberMap: Record<string, string> = {};
    (assignments || []).forEach((a: any) => {
      memberMap[a.member_id] = a.member?.display_name || a.member?.full_name || "Member";
    });
    const memberIds = Object.keys(memberMap);
    if (memberIds.length === 0) {
      setPhotos([]);
      setLoading(false);
      return;
    }

    const { data: pending } = await supabase
      .from("food_logs")
      .select("*")
      .in("user_id", memberIds)
      .eq("photo_capture_status", "pending")
      .order("created_at");

    setPhotos((pending || []).map((p: any) => ({ ...p, member_name: memberMap[p.user_id] })));
    setLoading(false);
  };

  const openEdit = (p: PendingPhoto) => {
    setEditing(p);
    setEditName(p.food_name);
    setEditCal(p.calories?.toString() || "");
    setEditProtein(p.protein_g?.toString() || "");
    setEditCarbs(p.carbs_g?.toString() || "");
    setEditFat(p.fat_g?.toString() || "");
  };

  const affirm = async (action: "affirm" | "adjust") => {
    if (!editing) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const updates: Record<string, any> = {
      photo_capture_status: action === "affirm" ? "affirmed" : "adjusted",
      chef_affirmed_at: new Date().toISOString(),
      chef_affirmed_by: session.user.id,
      updated_at: new Date().toISOString(),
    };
    if (action === "adjust") {
      updates.food_name = editName;
      if (editCal) updates.calories = parseInt(editCal);
      if (editProtein) updates.protein_g = parseFloat(editProtein);
      if (editCarbs) updates.carbs_g = parseFloat(editCarbs);
      if (editFat) updates.fat_g = parseFloat(editFat);
    }

    await supabase.from("food_logs").update(updates).eq("id", editing.id);
    setEditing(null);
    load();
  };

  if (loading) return <div className="p-12 text-dust">Loading photos...</div>;

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-parchment">Photo Review</h1>
        <p className="text-dust mt-1">{photos.length} pending</p>
      </header>

      {photos.length === 0 ? (
        <div className="bg-charcoal border border-slate rounded-xl p-12 text-center text-dust">
          No photos pending review. Nice work.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {photos.map((p) => (
            <div key={p.id} className="bg-charcoal border border-slate rounded-xl overflow-hidden">
              {p.photo_url && (
                <div className="aspect-video bg-forge flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.photo_url} alt={p.food_name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-ember uppercase font-bold tracking-widest">{p.member_name}</span>
                  <span className="text-xs text-dust">{p.meal_type} · {p.log_date}</span>
                </div>
                <h3 className="text-lg font-bold text-parchment">{p.food_name}</h3>
                {p.narrative && (
                  <p className="text-sm text-dust italic mt-2">"{p.narrative}"</p>
                )}
                {p.calories && (
                  <div className="flex gap-4 mt-3 text-sm">
                    <span className="text-ember font-semibold">{p.calories} cal</span>
                    {p.protein_g && <span className="text-dust">P {p.protein_g}g</span>}
                    {p.carbs_g && <span className="text-dust">C {p.carbs_g}g</span>}
                    {p.fat_g && <span className="text-dust">F {p.fat_g}g</span>}
                  </div>
                )}
                <button
                  onClick={() => openEdit(p)}
                  className="w-full mt-4 bg-ember text-forge font-bold py-2 rounded-lg hover:bg-flame transition"
                >
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-charcoal border border-slate rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-parchment">Review Photo</h2>
                <button onClick={() => setEditing(null)} className="text-dust hover:text-parchment text-2xl">×</button>
              </div>

              {editing.photo_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={editing.photo_url} alt={editing.food_name} className="w-full rounded-lg mb-4" />
              )}

              {editing.narrative && (
                <div className="mb-4 p-3 bg-forge rounded-lg border border-ash">
                  <div className="text-xs text-dust uppercase font-bold tracking-widest mb-1">Member's note</div>
                  <p className="text-sm text-parchment italic">"{editing.narrative}"</p>
                </div>
              )}

              <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2 mt-4">Food name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-forge text-parchment border border-slate rounded-lg px-3 py-2 focus:border-ember focus:outline-none"
              />

              <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2 mt-4">Calories</label>
              <input
                type="number"
                value={editCal}
                onChange={(e) => setEditCal(e.target.value)}
                className="w-full bg-forge text-parchment border border-slate rounded-lg px-3 py-2 focus:border-ember focus:outline-none"
              />

              <div className="grid grid-cols-3 gap-3 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">Protein</label>
                  <input type="number" value={editProtein} onChange={(e) => setEditProtein(e.target.value)} className="w-full bg-forge text-parchment border border-slate rounded-lg px-3 py-2 focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">Carbs</label>
                  <input type="number" value={editCarbs} onChange={(e) => setEditCarbs(e.target.value)} className="w-full bg-forge text-parchment border border-slate rounded-lg px-3 py-2 focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">Fat</label>
                  <input type="number" value={editFat} onChange={(e) => setEditFat(e.target.value)} className="w-full bg-forge text-parchment border border-slate rounded-lg px-3 py-2 focus:border-ember focus:outline-none" />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => affirm("affirm")} className="flex-1 bg-ember text-forge font-bold py-3 rounded-lg hover:bg-flame transition">
                  Affirm
                </button>
                <button onClick={() => affirm("adjust")} className="flex-1 bg-forge text-ember font-bold py-3 rounded-lg border border-ember hover:bg-ash transition">
                  Adjust
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
