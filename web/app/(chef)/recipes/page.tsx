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

interface Ingredient {
  fdc_id?: string;
  name: string;
  quantity: number;
  unit: string;
  // Per 100g from USDA
  cal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
}

interface USDAResult {
  fdcId: string;
  description: string;
  brandOwner?: string;
  nutrients: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  servingSize: number;
  servingUnit: string;
}

const API_BASE = "https://api.flamsanct.com/v1";

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [chefId, setChefId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Recipe form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("1");
  const [tags, setTags] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  // USDA search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<USDAResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Manual ingredient entry
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCal, setManualCal] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");

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

  const searchUSDA = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE}/nutrition/search?q=${encodeURIComponent(searchQuery)}&limit=10`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      setSearchResults(json.data || []);
    } catch (e) {
      console.error(e);
    }
    setSearching(false);
  };

  const addIngredientFromUSDA = (food: USDAResult) => {
    const baseQty = food.servingSize || 100;
    setIngredients([
      ...ingredients,
      {
        fdc_id: food.fdcId,
        name: food.description,
        quantity: baseQty,
        unit: food.servingUnit || "g",
        cal_per_100g: (food.nutrients.calories || 0),
        protein_per_100g: (food.nutrients.protein_g || 0),
        carbs_per_100g: (food.nutrients.carbs_g || 0),
        fat_per_100g: (food.nutrients.fat_g || 0),
      },
    ]);
    setSearchResults([]);
    setSearchQuery("");
  };

  const addManualIngredient = () => {
    if (!manualName.trim()) return;
    setIngredients([
      ...ingredients,
      {
        name: manualName.trim(),
        quantity: 100,
        unit: "g",
        cal_per_100g: parseFloat(manualCal) || 0,
        protein_per_100g: parseFloat(manualProtein) || 0,
        carbs_per_100g: parseFloat(manualCarbs) || 0,
        fat_per_100g: parseFloat(manualFat) || 0,
      },
    ]);
    setManualName(""); setManualCal(""); setManualProtein(""); setManualCarbs(""); setManualFat("");
    setManualMode(false);
  };

  const updateIngredientQty = (idx: number, qty: number) => {
    const updated = [...ingredients];
    updated[idx].quantity = qty;
    setIngredients(updated);
  };

  const removeIngredient = (idx: number) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };

  // Compute totals
  const totals = ingredients.reduce(
    (acc, ing) => {
      const ratio = ing.quantity / 100;
      return {
        cal: acc.cal + ing.cal_per_100g * ratio,
        protein: acc.protein + ing.protein_per_100g * ratio,
        carbs: acc.carbs + ing.carbs_per_100g * ratio,
        fat: acc.fat + ing.fat_per_100g * ratio,
      };
    },
    { cal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const servingCount = parseInt(servings) || 1;
  const perServing = {
    cal: Math.round(totals.cal / servingCount),
    protein: Math.round((totals.protein / servingCount) * 10) / 10,
    carbs: Math.round((totals.carbs / servingCount) * 10) / 10,
    fat: Math.round((totals.fat / servingCount) * 10) / 10,
  };

  const resetForm = () => {
    setName(""); setDescription(""); setServings("1"); setTags("");
    setIngredients([]); setSearchQuery(""); setSearchResults([]);
  };

  const handleSave = async () => {
    if (!chefId || !name.trim()) return;
    setSaving(true);
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("chef_recipes").insert({
      chef_id: chefId,
      name: name.trim(),
      description: description.trim() || null,
      serving_size: `1 of ${servingCount} servings`,
      calories_per_serving: perServing.cal || null,
      protein_g: perServing.protein || null,
      carbs_g: perServing.carbs || null,
      fat_g: perServing.fat || null,
      tags: tagList.length ? tagList : null,
      is_active: true,
    });
    setSaving(false);
    if (!error) {
      resetForm();
      setShowModal(false);
      await load(chefId);
    }
  };

  const handleDelete = async (id: string) => {
    if (!chefId) return;
    if (!confirm("Delete this recipe?")) return;
    await supabase.from("chef_recipes").update({ is_active: false }).eq("id", id);
    await load(chefId);
  };

  if (loading) return <div className="p-12 text-dust">Loading...</div>;

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

      {/* Recipe grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {recipes.map((r) => (
          <div key={r.id} className="bg-charcoal border border-slate rounded-xl p-6 hover:border-ember transition">
            <div className="flex justify-between items-start">
              <h2 className="text-xl font-bold text-parchment">{r.name}</h2>
              <button onClick={() => handleDelete(r.id)} className="text-dust hover:text-ember text-sm ml-2">
                Delete
              </button>
            </div>
            {r.description && <p className="text-dust text-sm mt-2">{r.description}</p>}
            {r.serving_size && <p className="text-dust text-xs mt-1">{r.serving_size}</p>}
            <div className="mt-4 text-sm text-parchment">
              <span className="text-ember font-bold">{r.calories_per_serving ?? "-"}</span> cal
            </div>
            <div className="text-dust text-xs mt-1">
              P {r.protein_g ?? "-"}g · C {r.carbs_g ?? "-"}g · F {r.fat_g ?? "-"}g
            </div>
            {r.tags && r.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.tags.map((t) => (
                  <span key={t} className="text-xs bg-forge text-ember border border-slate px-2 py-1 rounded">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Recipe Builder Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-charcoal border border-slate rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-parchment">Build Recipe</h2>
                <button onClick={() => { resetForm(); setShowModal(false); }} className="text-dust hover:text-parchment text-2xl">×</button>
              </div>

              {/* Basic info */}
              <div className="space-y-3 mb-6">
                <div>
                  <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">Recipe name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Herb Roasted Chicken Thighs"
                    className="w-full bg-forge border border-slate rounded-lg px-3 py-2 text-parchment focus:border-ember outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Bone-in thighs, rosemary, garlic"
                    className="w-full bg-forge border border-slate rounded-lg px-3 py-2 text-parchment focus:border-ember outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">Servings</label>
                    <input
                      type="number"
                      value={servings}
                      onChange={(e) => setServings(e.target.value)}
                      className="w-full bg-forge border border-slate rounded-lg px-3 py-2 text-parchment focus:border-ember outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">Tags</label>
                    <input
                      type="text"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="high-protein, low-carb"
                      className="w-full bg-forge border border-slate rounded-lg px-3 py-2 text-parchment focus:border-ember outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* USDA Search */}
              <div className="mb-6">
                <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">Add from USDA</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchUSDA(); } }}
                    placeholder="Search foods... e.g. 'chicken breast'"
                    className="flex-1 bg-forge border border-slate rounded-lg px-3 py-2 text-parchment focus:border-ember outline-none"
                  />
                  <button
                    onClick={searchUSDA}
                    disabled={searching || !searchQuery.trim()}
                    className="bg-ember text-forge font-bold px-4 rounded-lg hover:bg-flame transition disabled:opacity-50"
                  >
                    {searching ? "..." : "Search"}
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-3 bg-forge border border-slate rounded-lg max-h-60 overflow-y-auto">
                    {searchResults.map((food) => (
                      <button
                        key={food.fdcId}
                        onClick={() => addIngredientFromUSDA(food)}
                        className="w-full text-left px-3 py-2 hover:bg-ash border-b border-ash last:border-0"
                      >
                        <div className="text-sm font-semibold text-parchment">{food.description}</div>
                        <div className="text-xs text-dust">
                          {Math.round(food.nutrients.calories)} cal · P {food.nutrients.protein_g?.toFixed(1)}g · C {food.nutrients.carbs_g?.toFixed(1)}g · F {food.nutrients.fat_g?.toFixed(1)}g (per 100g)
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setManualMode(!manualMode)}
                  className="text-xs text-dust hover:text-ember mt-2"
                >
                  {manualMode ? "← Cancel manual" : "+ Add manual ingredient"}
                </button>

                {manualMode && (
                  <div className="mt-3 bg-forge border border-ash rounded-lg p-3 space-y-2">
                    <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Ingredient name" className="w-full bg-charcoal border border-slate rounded px-2 py-1 text-parchment text-sm focus:border-ember outline-none" />
                    <div className="grid grid-cols-4 gap-2">
                      <input type="number" value={manualCal} onChange={(e) => setManualCal(e.target.value)} placeholder="Cal/100g" className="bg-charcoal border border-slate rounded px-2 py-1 text-parchment text-sm focus:border-ember outline-none" />
                      <input type="number" value={manualProtein} onChange={(e) => setManualProtein(e.target.value)} placeholder="P g" className="bg-charcoal border border-slate rounded px-2 py-1 text-parchment text-sm focus:border-ember outline-none" />
                      <input type="number" value={manualCarbs} onChange={(e) => setManualCarbs(e.target.value)} placeholder="C g" className="bg-charcoal border border-slate rounded px-2 py-1 text-parchment text-sm focus:border-ember outline-none" />
                      <input type="number" value={manualFat} onChange={(e) => setManualFat(e.target.value)} placeholder="F g" className="bg-charcoal border border-slate rounded px-2 py-1 text-parchment text-sm focus:border-ember outline-none" />
                    </div>
                    <button onClick={addManualIngredient} className="text-xs text-ember font-bold">+ Add to recipe</button>
                  </div>
                )}
              </div>

              {/* Ingredient list */}
              {ingredients.length > 0 && (
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-dust uppercase tracking-wider mb-2">Ingredients</label>
                  <div className="space-y-2">
                    {ingredients.map((ing, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-forge border border-slate rounded-lg p-3">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-parchment">{ing.name}</div>
                          <div className="text-xs text-dust">
                            {Math.round(ing.cal_per_100g * (ing.quantity / 100))} cal · P {(ing.protein_per_100g * (ing.quantity / 100)).toFixed(1)}g · C {(ing.carbs_per_100g * (ing.quantity / 100)).toFixed(1)}g · F {(ing.fat_per_100g * (ing.quantity / 100)).toFixed(1)}g
                          </div>
                        </div>
                        <input
                          type="number"
                          value={ing.quantity}
                          onChange={(e) => updateIngredientQty(idx, parseFloat(e.target.value) || 0)}
                          className="w-20 bg-charcoal border border-slate rounded px-2 py-1 text-parchment text-sm focus:border-ember outline-none text-right"
                        />
                        <span className="text-xs text-dust w-8">{ing.unit}</span>
                        <button onClick={() => removeIngredient(idx)} className="text-dust hover:text-crisis text-sm px-2">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Totals */}
              {ingredients.length > 0 && (
                <div className="bg-forge border border-ember rounded-lg p-4 mb-6">
                  <div className="text-xs font-semibold text-ember uppercase tracking-widest mb-2">Per Serving (÷ {servingCount})</div>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div>
                      <div className="text-2xl font-black text-parchment">{perServing.cal}</div>
                      <div className="text-xs text-dust">CAL</div>
                    </div>
                    <div>
                      <div className="text-2xl font-black text-parchment">{perServing.protein}</div>
                      <div className="text-xs text-dust">PROTEIN</div>
                    </div>
                    <div>
                      <div className="text-2xl font-black text-parchment">{perServing.carbs}</div>
                      <div className="text-xs text-dust">CARBS</div>
                    </div>
                    <div>
                      <div className="text-2xl font-black text-parchment">{perServing.fat}</div>
                      <div className="text-xs text-dust">FAT</div>
                    </div>
                  </div>
                  <div className="text-xs text-dust mt-3 text-center">
                    Total recipe: {Math.round(totals.cal)} cal
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button onClick={() => { resetForm(); setShowModal(false); }} className="text-dust hover:text-parchment py-2 px-4">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim() || ingredients.length === 0}
                  className="bg-ember text-forge font-bold py-2 px-6 rounded-lg hover:bg-flame transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Recipe"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
