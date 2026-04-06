import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface Recipe {
  id: string;
  name: string;
  description: string | null;
  serving_size: string | null;
  calories_per_serving: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  tags: string[] | null;
}

export default function RecipesScreen() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  // New recipe fields
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [serving, setServing] = useState("");
  const [cal, setCal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => { if (userId) loadRecipes(); }, [userId]);

  const loadRecipes = async () => {
    if (!userId) return;
    setLoading(true);
    let query = supabase.from("chef_recipes").select("*").eq("chef_id", userId).eq("is_active", true).order("created_at", { ascending: false });
    if (search) query = query.ilike("name", `%${search}%`);
    const { data } = await query;
    setRecipes(data || []);
    setLoading(false);
  };

  const addRecipe = async () => {
    if (!userId || !name.trim()) return;
    setSaving(true);
    await supabase.from("chef_recipes").insert({
      chef_id: userId,
      name: name.trim(),
      description: desc.trim() || null,
      serving_size: serving.trim() || null,
      calories_per_serving: cal ? parseInt(cal) : null,
      protein_g: protein ? parseFloat(protein) : null,
      carbs_g: carbs ? parseFloat(carbs) : null,
      fat_g: fat ? parseFloat(fat) : null,
      tags: tags ? tags.split(",").map((t) => t.trim()) : null,
    });
    setShowAdd(false);
    setName(""); setDesc(""); setServing(""); setCal(""); setProtein(""); setCarbs(""); setFat(""); setTags("");
    setSaving(false);
    loadRecipes();
  };

  const deleteRecipe = (id: string, recipeName: string) => {
    Alert.alert("Delete recipe?", recipeName, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("chef_recipes").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
          loadRecipes();
        },
      },
    ]);
  };

  if (loading) {
    return <View style={[st.container, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color="#C0632A" />
    </View>;
  }

  return (
    <View style={st.container}>
      <View style={st.headerRow}>
        <TextInput
          style={st.searchInput}
          placeholder="Search recipes..."
          placeholderTextColor="#5C5A54"
          value={search}
          onChangeText={(t) => { setSearch(t); }}
          onSubmitEditing={loadRecipes}
        />
        <TouchableOpacity onPress={() => setShowAdd(true)}>
          <Ionicons name="add-circle" size={28} color="#C0632A" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {recipes.map((r) => (
          <TouchableOpacity key={r.id} style={st.card} onLongPress={() => deleteRecipe(r.id, r.name)}>
            <Text style={st.recipeName}>{r.name}</Text>
            {r.description && <Text style={st.recipeDesc}>{r.description}</Text>}
            <View style={st.macroRow}>
              {r.calories_per_serving && <Text style={st.macro}>{r.calories_per_serving} cal</Text>}
              {r.protein_g && <Text style={st.macro}>{r.protein_g}g P</Text>}
              {r.carbs_g && <Text style={st.macro}>{r.carbs_g}g C</Text>}
              {r.fat_g && <Text style={st.macro}>{r.fat_g}g F</Text>}
            </View>
            {r.serving_size && <Text style={st.servingSize}>Serving: {r.serving_size}</Text>}
            {r.tags && r.tags.length > 0 && (
              <View style={st.tagRow}>
                {r.tags.map((t, i) => (
                  <View key={i} style={st.tag}><Text style={st.tagText}>{t}</Text></View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        ))}
        {recipes.length === 0 && <Text style={st.empty}>No recipes yet. Tap + to add one.</Text>}
      </ScrollView>

      {/* Add Recipe Modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <ScrollView contentContainerStyle={{ justifyContent: "flex-end", flexGrow: 1 }}>
            <View style={st.modal}>
              <View style={st.modalHeader}>
                <Text style={st.modalTitle}>New Recipe</Text>
                <TouchableOpacity onPress={() => setShowAdd(false)}>
                  <Ionicons name="close" size={24} color="#9C9A94" />
                </TouchableOpacity>
              </View>
              <TextInput style={st.input} placeholder="Recipe name *" placeholderTextColor="#5C5A54" value={name} onChangeText={setName} />
              <TextInput style={st.input} placeholder="Description" placeholderTextColor="#5C5A54" value={desc} onChangeText={setDesc} />
              <TextInput style={st.input} placeholder="Serving size (e.g. 2 thighs)" placeholderTextColor="#5C5A54" value={serving} onChangeText={setServing} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput style={[st.input, { flex: 1 }]} placeholder="Cal" placeholderTextColor="#5C5A54" value={cal} onChangeText={setCal} keyboardType="numeric" />
                <TextInput style={[st.input, { flex: 1 }]} placeholder="Protein" placeholderTextColor="#5C5A54" value={protein} onChangeText={setProtein} keyboardType="numeric" />
                <TextInput style={[st.input, { flex: 1 }]} placeholder="Carbs" placeholderTextColor="#5C5A54" value={carbs} onChangeText={setCarbs} keyboardType="numeric" />
                <TextInput style={[st.input, { flex: 1 }]} placeholder="Fat" placeholderTextColor="#5C5A54" value={fat} onChangeText={setFat} keyboardType="numeric" />
              </View>
              <TextInput style={st.input} placeholder="Tags (comma-separated)" placeholderTextColor="#5C5A54" value={tags} onChangeText={setTags} />
              <TouchableOpacity style={[st.cta, saving && { opacity: 0.6 }]} onPress={addRecipe} disabled={saving}>
                {saving ? <ActivityIndicator color="#1C1C1A" /> : <Text style={st.ctaText}>Save Recipe</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 16 },
  headerRow: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 16 },
  searchInput: { flex: 1, backgroundColor: "#2E2D2A", color: "#F0EDE6", borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 0.5, borderColor: "#5C5A54" },
  card: { backgroundColor: "#2E2D2A", borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: "#3D3C38" },
  recipeName: { fontSize: 16, fontWeight: "700", color: "#F0EDE6" },
  recipeDesc: { fontSize: 14, color: "#9C9A94", marginTop: 4 },
  macroRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  macro: { fontSize: 13, color: "#C0632A", fontWeight: "600" },
  servingSize: { fontSize: 12, color: "#5C5A54", marginTop: 4 },
  tagRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  tag: { backgroundColor: "#1C1C1A", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, color: "#9C9A94" },
  empty: { color: "#5C5A54", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)" },
  modal: { backgroundColor: "#2E2D2A", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#F0EDE6" },
  input: { backgroundColor: "#1C1C1A", color: "#F0EDE6", borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 0.5, borderColor: "#5C5A54", marginBottom: 8 },
  cta: { backgroundColor: "#C0632A", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 8 },
  ctaText: { color: "#1C1C1A", fontSize: 15, fontWeight: "700" },
});
