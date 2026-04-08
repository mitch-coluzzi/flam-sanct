"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Recipe = {
  id: string;
  name: string;
  description: string | null;
  serving_size: string | null;
  calories_per_serving: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  tags: string[] | null;
};

const emptyForm = {
  name: "",
  description: "",
  serving_size: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  tags: "",
};

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [chefId, setChefId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = async (id: string) => {
    const { data } = await supabase
      .from("chef_recipes")
      .select("*")
      .eq("chef_id", id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setRecipes((data as Recipe[]) || []);
  };

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const id = sessionData.session?.user.id ?? null;
      setChefId(id);
      if (id) await load(id);
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!chefId || !form.name) return;
    setSaving(true);
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const { error } = await supabase.from("chef_recipes").insert({
      chef_id: chefId,
      name: form.name,
      description: form.description || null,
      serving_size: form.serving_size || null,
      calories_per_serving: form.calories ? Number(form.calories) : null,
      protein_g: form.protein ? Number(form.protein) : null,
      carbs_g: form.carbs ? Number(form.carbs) : null,
      fat_g: form.fat ? Number(form.fat) : null,
      tags: tags.length ? tags : null,
      is_active: true,
    });
    setSaving(false);
    if (!error) {
      setForm({ ...emptyForm });
      setShowModal(false);
      await load(chefId);
    }
  };

  const handleDelete = async (id: string) => {
    if (!chefId) return;
    const { error } = await supabase
      .from("chef_recipes")
      .update({ is_active: false })
      .eq("id", id);
    if (!error) await load(chefId);
  };

  if (loading) {
    return <div className="p-12 text-dust">Loading...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8">
        <header>
          <h1 className="text-3xl font-bold text-parchment">Recipes</h1>
          <p className="text-dust mt-1">{recipes.length} active</p>
        </header>
        <button
          onClick={() => setShowModal(true)}
          className="bg-ember text-forge font-bold py-2 px-4 rounded-lg hover:bg-flame transition"
        >
          + Add Recipe
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {recipes.map((r) => (
          <div
            key={r.id}
            className="bg-charcoal border border-slate rounded-xl p-6 hover:border-ember transition relative"
          >
            <div className="flex justify-between items-start">
              <h2 className="text-xl font-bold text-parchment">{r.name}</h2>
              <button
                onClick={() => handleDelete(r.id)}
                className="text-dust hover:text-ember text-sm ml-2"
                aria-label="Delete recipe"
              >
                Delete
              </button>
            </div>
            {r.description && (
              <p className="text-dust text-sm mt-2">{r.description}</p>
            )}
            <div className="mt-4 text-sm text-parchment">
              <span className="text-ember font-bold">
                {r.calories_per_serving ?? "-"}
              </span>{" "}
              cal
            </div>
            <div className="text-dust text-xs mt-1">
              P {r.protein_g ?? "-"}g · C {r.carbs_g ?? "-"}g · F{" "}
              {r.fat_g ?? "-"}g
            </div>
            {r.tags && r.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs bg-forge text-ember border border-slate px-2 py-1 rounded"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-charcoal border border-slate rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-parchment mb-4">
              Add Recipe
            </h2>
            <div className="space-y-3">
              {[
                { k: "name", label: "Name" },
                { k: "description", label: "Description" },
                { k: "serving_size", label: "Serving Size" },
                { k: "calories", label: "Calories", type: "number" },
                { k: "protein", label: "Protein (g)", type: "number" },
                { k: "carbs", label: "Carbs (g)", type: "number" },
                { k: "fat", label: "Fat (g)", type: "number" },
                { k: "tags", label: "Tags (comma separated)" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="block text-dust text-xs mb-1">
                    {f.label}
                  </label>
                  <input
                    type={f.type || "text"}
                    value={(form as any)[f.k]}
                    onChange={(e) =>
                      setForm({ ...form, [f.k]: e.target.value })
                    }
                    className="w-full bg-forge border border-slate rounded-lg px-3 py-2 text-parchment focus:border-ember outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="text-dust hover:text-parchment py-2 px-4"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name}
                className="bg-ember text-forge font-bold py-2 px-4 rounded-lg hover:bg-flame transition disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
