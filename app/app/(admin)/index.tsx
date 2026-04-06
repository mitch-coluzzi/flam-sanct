import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface User {
  id: string;
  email: string;
  full_name: string;
  display_name: string | null;
  role: string;
  f3_name: string | null;
  onboarded_at: string | null;
}

interface ChefAssignment {
  id: string;
  chef_id: string;
  member_id: string;
  active: boolean;
  chef_name: string;
  member_name: string;
}

export default function AdminScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [tab, setTab] = useState<"users" | "assignments" | "stoic" | "benchmarks">("users");
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<ChefAssignment[]>([]);
  const [passages, setPassages] = useState<any[]>([]);

  // Role change modal
  const [roleUser, setRoleUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState("");

  // Assignment modal
  const [showAssign, setShowAssign] = useState(false);
  const [assignChef, setAssignChef] = useState("");
  const [assignMember, setAssignMember] = useState("");

  // Stoic passage modal
  const [showPassage, setShowPassage] = useState(false);
  const [pAuthor, setPAuthor] = useState("");
  const [pSource, setPSource] = useState("");
  const [pText, setPText] = useState("");
  const [pTags, setPTags] = useState("");

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    if (tab === "users") {
      const { data } = await supabase.from("users").select("id, email, full_name, display_name, role, f3_name, onboarded_at").is("deleted_at", null).order("created_at");
      setUsers(data || []);
    } else if (tab === "assignments") {
      const { data } = await supabase
        .from("chef_assignments")
        .select("id, chef_id, member_id, active, chef:users!chef_assignments_chef_id_fkey(full_name), member:users!chef_assignments_member_id_fkey(full_name)")
        .eq("active", true);
      setAssignments((data || []).map((a) => ({
        ...a,
        chef_name: (a.chef as any)?.full_name || "",
        member_name: (a.member as any)?.full_name || "",
      })));
    } else if (tab === "stoic") {
      const { data } = await supabase.from("stoic_passages").select("*").eq("is_active", true).order("author").limit(50);
      setPassages(data || []);
    }
    setLoading(false);
  };

  const changeRole = async () => {
    if (!roleUser || !newRole) return;
    await supabase.from("users").update({ role: newRole, updated_at: new Date().toISOString() }).eq("id", roleUser.id);
    setRoleUser(null);
    setNewRole("");
    loadData();
  };

  const createAssignment = async () => {
    if (!assignChef || !assignMember) return;
    const now = new Date().toISOString();
    // Deactivate existing
    await supabase.from("chef_assignments").update({ active: false, ended_at: now }).eq("member_id", assignMember).eq("active", true);
    // Create new
    await supabase.from("chef_assignments").insert({ chef_id: assignChef, member_id: assignMember, active: true, started_at: now });

    // Auto-create DM
    const { data: conv } = await supabase.from("conversations").insert({ conversation_type: "dm", created_by: profile?.id }).select().single();
    if (conv) {
      await supabase.from("conversation_participants").insert([
        { conversation_id: conv.id, user_id: assignChef },
        { conversation_id: conv.id, user_id: assignMember },
      ]);
      const { data: chef } = await supabase.from("users").select("full_name").eq("id", assignChef).single();
      await supabase.from("messages").insert({
        conversation_id: conv.id, sender_id: profile?.id,
        body: `Chef ${chef?.full_name || ""} has been assigned to your nutrition. You can message them directly here.`,
        message_type: "system",
      });
    }

    setShowAssign(false);
    setAssignChef("");
    setAssignMember("");
    loadData();
  };

  const addPassage = async () => {
    if (!pAuthor || !pText) return;
    await supabase.from("stoic_passages").insert({
      author: pAuthor.trim(),
      source: pSource.trim() || null,
      passage: pText.trim(),
      tags: pTags ? pTags.split(",").map((t) => t.trim()) : null,
    });
    setShowPassage(false);
    setPAuthor(""); setPSource(""); setPText(""); setPTags("");
    loadData();
  };

  const chefs = users.filter((u) => u.role === "chef");
  const members = users.filter((u) => u.role === "member");

  if (loading) {
    return <View style={[st.container, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color="#C0632A" />
    </View>;
  }

  return (
    <View style={st.container}>
      {/* Tab bar */}
      <View style={st.tabBar}>
        {(["users", "assignments", "stoic", "benchmarks"] as const).map((t) => (
          <TouchableOpacity key={t} style={[st.tab, tab === t && st.tabActive]} onPress={() => setTab(t)}>
            <Text style={[st.tabText, tab === t && st.tabTextActive]}>
              {t === "users" ? "Users" : t === "assignments" ? "Chef" : t === "stoic" ? "Stoic" : "Bench"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Users */}
        {tab === "users" && users.map((u) => (
          <TouchableOpacity key={u.id} style={st.card} onPress={() => { setRoleUser(u); setNewRole(u.role); }}>
            <View style={st.cardRow}>
              <Text style={st.userName}>{u.display_name || u.full_name}</Text>
              <View style={[st.roleBadge, u.role === "admin" && { backgroundColor: "#C0632A" }, u.role === "chef" && { backgroundColor: "#3D3C38" }]}>
                <Text style={st.roleText}>{u.role.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={st.userEmail}>{u.email}</Text>
            {u.f3_name && <Text style={st.f3Name}>F3: {u.f3_name}</Text>}
            {!u.onboarded_at && <Text style={st.notOnboarded}>Not onboarded</Text>}
          </TouchableOpacity>
        ))}

        {/* Assignments */}
        {tab === "assignments" && (
          <>
            <TouchableOpacity style={st.addBtn} onPress={() => setShowAssign(true)}>
              <Ionicons name="add-circle" size={20} color="#C0632A" />
              <Text style={st.addBtnText}>New Assignment</Text>
            </TouchableOpacity>
            {assignments.map((a) => (
              <View key={a.id} style={st.card}>
                <Text style={st.userName}>{a.chef_name} → {a.member_name}</Text>
              </View>
            ))}
            {assignments.length === 0 && <Text style={st.empty}>No active assignments.</Text>}
          </>
        )}

        {/* Stoic */}
        {tab === "stoic" && (
          <>
            <TouchableOpacity style={st.addBtn} onPress={() => setShowPassage(true)}>
              <Ionicons name="add-circle" size={20} color="#C0632A" />
              <Text style={st.addBtnText}>Add Passage</Text>
            </TouchableOpacity>
            <Text style={st.countText}>{passages.length} passages in library</Text>
            {passages.map((p) => (
              <View key={p.id} style={st.card}>
                <Text style={st.passage}>"{p.passage.substring(0, 120)}{p.passage.length > 120 ? "..." : ""}"</Text>
                <Text style={st.attribution}>— {p.author}{p.source ? `, ${p.source}` : ""}</Text>
                {p.tags && <View style={st.tagRow}>{p.tags.map((t: string, i: number) => <View key={i} style={st.tag}><Text style={st.tagText}>{t}</Text></View>)}</View>}
              </View>
            ))}
          </>
        )}

        {/* Benchmarks */}
        {tab === "benchmarks" && (
          <Text style={st.empty}>Benchmark management coming soon. Benchmarks are seeded and active.</Text>
        )}
      </ScrollView>

      {/* Role Change Modal */}
      <Modal visible={!!roleUser} animationType="fade" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modalSmall}>
            <Text style={st.modalTitle}>{roleUser?.display_name || roleUser?.full_name}</Text>
            <Text style={st.userEmail}>{roleUser?.email}</Text>
            <View style={st.roleRow}>
              {["member", "chef", "admin"].map((r) => (
                <TouchableOpacity key={r} style={[st.roleBtn, newRole === r && st.roleBtnActive]} onPress={() => setNewRole(r)}>
                  <Text style={[st.roleBtnText, newRole === r && st.roleBtnTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity style={[st.cta, { flex: 1 }]} onPress={changeRole}><Text style={st.ctaText}>Save</Text></TouchableOpacity>
              <TouchableOpacity style={[st.ctaCancel, { flex: 1 }]} onPress={() => setRoleUser(null)}><Text style={st.ctaCancelText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assignment Modal */}
      <Modal visible={showAssign} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modal}>
            <Text style={st.modalTitle}>Assign Chef</Text>
            <Text style={st.label}>Chef</Text>
            <View style={st.chipRow}>
              {chefs.map((c) => (
                <TouchableOpacity key={c.id} style={[st.chip, assignChef === c.id && st.chipActive]} onPress={() => setAssignChef(c.id)}>
                  <Text style={[st.chipText, assignChef === c.id && st.chipTextActive]}>{c.display_name || c.full_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={st.label}>Member</Text>
            <View style={st.chipRow}>
              {members.map((m) => (
                <TouchableOpacity key={m.id} style={[st.chip, assignMember === m.id && st.chipActive]} onPress={() => setAssignMember(m.id)}>
                  <Text style={[st.chipText, assignMember === m.id && st.chipTextActive]}>{m.display_name || m.full_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[st.cta, { flex: 1 }]} onPress={createAssignment}><Text style={st.ctaText}>Assign</Text></TouchableOpacity>
              <TouchableOpacity style={[st.ctaCancel, { flex: 1 }]} onPress={() => setShowAssign(false)}><Text style={st.ctaCancelText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Passage Modal */}
      <Modal visible={showPassage} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modal}>
            <Text style={st.modalTitle}>Add Stoic Passage</Text>
            <TextInput style={st.input} placeholder="Author *" placeholderTextColor="#5C5A54" value={pAuthor} onChangeText={setPAuthor} />
            <TextInput style={st.input} placeholder="Source (e.g. Meditations, Book V)" placeholderTextColor="#5C5A54" value={pSource} onChangeText={setPSource} />
            <TextInput style={[st.input, { minHeight: 100, textAlignVertical: "top" }]} placeholder="Passage text *" placeholderTextColor="#5C5A54" value={pText} onChangeText={setPText} multiline />
            <TextInput style={st.input} placeholder="Tags (comma-separated)" placeholderTextColor="#5C5A54" value={pTags} onChangeText={setPTags} />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <TouchableOpacity style={[st.cta, { flex: 1 }]} onPress={addPassage}><Text style={st.ctaText}>Save</Text></TouchableOpacity>
              <TouchableOpacity style={[st.ctaCancel, { flex: 1 }]} onPress={() => setShowPassage(false)}><Text style={st.ctaCancelText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 16 },
  tabBar: { flexDirection: "row", gap: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#2E2D2A", alignItems: "center" },
  tabActive: { backgroundColor: "#C0632A" },
  tabText: { color: "#9C9A94", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#1C1C1A" },
  card: { backgroundColor: "#2E2D2A", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: "#3D3C38" },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  userName: { fontSize: 15, fontWeight: "700", color: "#F0EDE6" },
  userEmail: { fontSize: 13, color: "#9C9A94", marginTop: 2 },
  f3Name: { fontSize: 12, color: "#C0632A", marginTop: 2 },
  notOnboarded: { fontSize: 12, color: "#5C5A54", fontStyle: "italic", marginTop: 2 },
  roleBadge: { backgroundColor: "#2E2D2A", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 0.5, borderColor: "#5C5A54" },
  roleText: { fontSize: 10, fontWeight: "700", color: "#F0EDE6", letterSpacing: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  addBtnText: { fontSize: 15, color: "#C0632A", fontWeight: "600" },
  countText: { fontSize: 13, color: "#5C5A54", marginBottom: 12 },
  passage: { fontSize: 14, color: "#F0EDE6", fontStyle: "italic", lineHeight: 20 },
  attribution: { fontSize: 12, color: "#9C9A94", marginTop: 6 },
  tagRow: { flexDirection: "row", gap: 4, marginTop: 6, flexWrap: "wrap" },
  tag: { backgroundColor: "#1C1C1A", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: 10, color: "#9C9A94" },
  empty: { color: "#5C5A54", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 },
  modalSmall: { backgroundColor: "#2E2D2A", borderRadius: 16, padding: 24 },
  modal: { backgroundColor: "#2E2D2A", borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#F0EDE6", marginBottom: 12 },
  label: { fontSize: 12, fontWeight: "600", color: "#9C9A94", marginBottom: 6, marginTop: 12, textTransform: "uppercase", letterSpacing: 1 },
  input: { backgroundColor: "#1C1C1A", color: "#F0EDE6", borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 0.5, borderColor: "#5C5A54", marginBottom: 8 },
  roleRow: { flexDirection: "row", gap: 8, marginVertical: 16 },
  roleBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: "#1C1C1A", alignItems: "center", borderWidth: 0.5, borderColor: "#5C5A54" },
  roleBtnActive: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  roleBtnText: { color: "#9C9A94", fontWeight: "600" },
  roleBtnTextActive: { color: "#1C1C1A" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#1C1C1A", borderWidth: 0.5, borderColor: "#5C5A54" },
  chipActive: { backgroundColor: "#C0632A", borderColor: "#C0632A" },
  chipText: { color: "#9C9A94", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#1C1C1A" },
  cta: { backgroundColor: "#C0632A", borderRadius: 8, padding: 14, alignItems: "center" },
  ctaText: { color: "#1C1C1A", fontSize: 15, fontWeight: "700" },
  ctaCancel: { backgroundColor: "#1C1C1A", borderRadius: 8, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#5C5A54" },
  ctaCancelText: { color: "#9C9A94", fontSize: 15, fontWeight: "600" },
});
