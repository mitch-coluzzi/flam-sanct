import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface MemberSummary {
  user_id: string;
  display_name: string;
  calories_in: number;
  calories_out: number;
  meals_logged: number;
  pending_photos: number;
  active_directives: number;
}

interface PendingPhoto {
  id: string;
  food_name: string;
  calories: number | null;
  photo_url: string | null;
  ai_portion_estimate: string | null;
  member_name: string;
  user_id: string;
}

interface Directive {
  id: string;
  directive_text: string;
  issued_by: string;
  created_at: string;
  chef_acknowledged_at: string | null;
  member_name: string;
}

export default function ChefDashboardScreen() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [tab, setTab] = useState<"members" | "photos" | "directives">("members");

  // Affirm modal
  const [affirmPhoto, setAffirmPhoto] = useState<PendingPhoto | null>(null);
  const [affirmCal, setAffirmCal] = useState("");
  const [affirmName, setAffirmName] = useState("");
  const [affirming, setAffirming] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => { if (userId) loadDashboard(); }, [userId]);

  const loadDashboard = async () => {
    if (!userId) return;
    setLoading(true);

    // Get assigned members
    const { data: assignments } = await supabase
      .from("chef_assignments")
      .select("member_id, member:users!chef_assignments_member_id_fkey(display_name, full_name)")
      .eq("chef_id", userId)
      .eq("active", true);

    const memberList: MemberSummary[] = [];
    const photos: PendingPhoto[] = [];

    for (const a of (assignments || [])) {
      const mid = a.member_id;
      const name = (a.member as any)?.display_name || (a.member as any)?.full_name || "Member";

      // Food logs today
      const { data: foods } = await supabase
        .from("food_logs").select("calories, photo_capture_status")
        .eq("user_id", mid).eq("log_date", today);
      const calIn = (foods || []).reduce((s, f) => s + (f.calories || 0), 0);
      const meals = new Set((foods || []).map((f: any) => f.meal_type)).size;
      const pending = (foods || []).filter((f) => f.photo_capture_status === "pending").length;

      // Workouts today
      const { data: workouts } = await supabase
        .from("workouts").select("estimated_calories_burned")
        .eq("user_id", mid).eq("log_date", today);
      const calOut = (workouts || []).reduce((s, w) => s + (w.estimated_calories_burned || 0), 0);

      // Directives
      const { count } = await supabase
        .from("dietary_directives").select("id", { count: "exact", head: true })
        .eq("chef_id", userId).eq("member_id", mid).eq("is_active", true);

      memberList.push({
        user_id: mid, display_name: name, calories_in: calIn,
        calories_out: calOut, meals_logged: meals, pending_photos: pending,
        active_directives: count || 0,
      });

      // Pending photos for this member
      const { data: pPhotos } = await supabase
        .from("food_logs")
        .select("id, food_name, calories, photo_url, ai_portion_estimate")
        .eq("user_id", mid).eq("photo_capture_status", "pending")
        .order("created_at");
      (pPhotos || []).forEach((p) => photos.push({ ...p, member_name: name, user_id: mid }));
    }

    setMembers(memberList);
    setPendingPhotos(photos);

    // Directives
    const { data: dirs } = await supabase
      .from("dietary_directives")
      .select("id, directive_text, issued_by, created_at, chef_acknowledged_at, member:users!dietary_directives_member_id_fkey(display_name, full_name)")
      .eq("chef_id", userId).eq("is_active", true)
      .order("created_at", { ascending: false });
    setDirectives((dirs || []).map((d) => ({
      ...d,
      member_name: (d.member as any)?.display_name || (d.member as any)?.full_name || "Member",
    })));

    setLoading(false);
  };

  const affirmCapture = async (action: "affirm" | "adjust") => {
    if (!affirmPhoto || !userId) return;
    setAffirming(true);
    const updates: Record<string, any> = {
      photo_capture_status: action === "affirm" ? "affirmed" : "adjusted",
      chef_affirmed_at: new Date().toISOString(),
      chef_affirmed_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (action === "adjust") {
      if (affirmName) updates.food_name = affirmName;
      if (affirmCal) updates.calories = parseInt(affirmCal);
    }
    await supabase.from("food_logs").update(updates).eq("id", affirmPhoto.id);
    setAffirmPhoto(null);
    setAffirmCal("");
    setAffirmName("");
    setAffirming(false);
    loadDashboard();
  };

  const acknowledgeDirective = async (id: string) => {
    await supabase.from("dietary_directives").update({
      chef_acknowledged_at: new Date().toISOString(),
    }).eq("id", id);
    loadDashboard();
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (loading) {
    return <View style={[st.container, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color="#C0632A" />
    </View>;
  }

  return (
    <View style={st.container}>
      {/* Tab bar */}
      <View style={st.tabBar}>
        {(["members", "photos", "directives"] as const).map((t) => (
          <TouchableOpacity key={t} style={[st.tab, tab === t && st.tabActive]} onPress={() => setTab(t)}>
            <Text style={[st.tabText, tab === t && st.tabTextActive]}>
              {t === "members" ? "Members" : t === "photos" ? `Photos${pendingPhotos.length ? ` (${pendingPhotos.length})` : ""}` : `Directives${directives.filter((d) => !d.chef_acknowledged_at).length ? ` (${directives.filter((d) => !d.chef_acknowledged_at).length})` : ""}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Members */}
        {tab === "members" && members.map((m) => (
          <View key={m.user_id} style={st.card}>
            <View style={st.cardRow}>
              <Text style={st.memberName}>{m.display_name}</Text>
              {m.pending_photos > 0 && <View style={st.badge}><Text style={st.badgeText}>{m.pending_photos}</Text></View>}
            </View>
            <View style={st.statsRow}>
              <Text style={st.stat}>{m.calories_in} in</Text>
              <Text style={st.stat}>{m.calories_out} out</Text>
              <Text style={st.stat}>{m.meals_logged} meals</Text>
            </View>
            {m.active_directives > 0 && (
              <Text style={st.directiveNote}>{m.active_directives} active directive{m.active_directives > 1 ? "s" : ""}</Text>
            )}
          </View>
        ))}
        {tab === "members" && members.length === 0 && (
          <Text style={st.empty}>No members assigned yet.</Text>
        )}

        {/* Photos */}
        {tab === "photos" && pendingPhotos.map((p) => (
          <TouchableOpacity key={p.id} style={st.card} onPress={() => { setAffirmPhoto(p); setAffirmName(p.food_name); setAffirmCal(String(p.calories || "")); }}>
            <Text style={st.memberName}>{p.member_name}</Text>
            <Text style={st.foodName}>{p.food_name}</Text>
            {p.calories && <Text style={st.stat}>AI estimate: ~{p.calories} cal</Text>}
            <Text style={st.actionHint}>Tap to affirm or adjust</Text>
          </TouchableOpacity>
        ))}
        {tab === "photos" && pendingPhotos.length === 0 && (
          <Text style={st.empty}>No photos pending review.</Text>
        )}

        {/* Directives */}
        {tab === "directives" && directives.map((d) => (
          <View key={d.id} style={st.card}>
            <View style={st.cardRow}>
              <Text style={st.memberName}>{d.member_name}</Text>
              <Text style={st.issuedBy}>{d.issued_by}</Text>
            </View>
            <Text style={st.directiveText}>{d.directive_text}</Text>
            <View style={st.cardRow}>
              <Text style={st.timeAgo}>{timeAgo(d.created_at)}</Text>
              {!d.chef_acknowledged_at ? (
                <TouchableOpacity style={st.ackBtn} onPress={() => acknowledgeDirective(d.id)}>
                  <Text style={st.ackBtnText}>Acknowledge</Text>
                </TouchableOpacity>
              ) : (
                <Text style={st.acked}>Acknowledged</Text>
              )}
            </View>
          </View>
        ))}
        {tab === "directives" && directives.length === 0 && (
          <Text style={st.empty}>No active directives.</Text>
        )}
      </ScrollView>

      {/* Affirm Modal */}
      <Modal visible={!!affirmPhoto} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modal}>
            <View style={st.cardRow}>
              <Text style={st.modalTitle}>Review Photo</Text>
              <TouchableOpacity onPress={() => setAffirmPhoto(null)}>
                <Ionicons name="close" size={24} color="#9C9A94" />
              </TouchableOpacity>
            </View>
            <Text style={st.label}>Food name</Text>
            <TextInput style={st.input} value={affirmName} onChangeText={setAffirmName} placeholderTextColor="#5C5A54" />
            <Text style={st.label}>Calories</Text>
            <TextInput style={st.input} value={affirmCal} onChangeText={setAffirmCal} keyboardType="numeric" placeholderTextColor="#5C5A54" />
            {affirmPhoto?.ai_portion_estimate && (
              <Text style={st.aiEstimate}>AI: {affirmPhoto.ai_portion_estimate.substring(0, 200)}</Text>
            )}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[st.cta, { flex: 1 }]} onPress={() => affirmCapture("affirm")} disabled={affirming}>
                <Text style={st.ctaText}>Affirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.ctaAdjust, { flex: 1 }]} onPress={() => affirmCapture("adjust")} disabled={affirming}>
                <Text style={st.ctaAdjustText}>Adjust</Text>
              </TouchableOpacity>
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
  card: { backgroundColor: "#2E2D2A", borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 0.5, borderColor: "#3D3C38" },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  memberName: { fontSize: 16, fontWeight: "700", color: "#F0EDE6" },
  statsRow: { flexDirection: "row", gap: 16, marginTop: 4 },
  stat: { fontSize: 13, color: "#9C9A94" },
  badge: { backgroundColor: "#C0632A", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: "#1C1C1A", fontSize: 12, fontWeight: "700" },
  directiveNote: { fontSize: 12, color: "#C0632A", marginTop: 6 },
  foodName: { fontSize: 14, color: "#F0EDE6", marginTop: 4 },
  actionHint: { fontSize: 12, color: "#C0632A", marginTop: 8 },
  issuedBy: { fontSize: 12, color: "#5C5A54", textTransform: "uppercase", letterSpacing: 1 },
  directiveText: { fontSize: 14, color: "#F0EDE6", lineHeight: 20, marginVertical: 8 },
  timeAgo: { fontSize: 12, color: "#5C5A54" },
  ackBtn: { backgroundColor: "#C0632A", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  ackBtnText: { color: "#1C1C1A", fontSize: 12, fontWeight: "700" },
  acked: { fontSize: 12, color: "#5C5A54", fontStyle: "italic" },
  empty: { color: "#5C5A54", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#2E2D2A", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#F0EDE6" },
  label: { fontSize: 12, fontWeight: "600", color: "#9C9A94", marginBottom: 6, marginTop: 12, textTransform: "uppercase", letterSpacing: 1 },
  input: { backgroundColor: "#1C1C1A", color: "#F0EDE6", borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 0.5, borderColor: "#5C5A54" },
  aiEstimate: { fontSize: 12, color: "#5C5A54", marginTop: 8, fontStyle: "italic" },
  cta: { backgroundColor: "#C0632A", borderRadius: 8, padding: 14, alignItems: "center" },
  ctaText: { color: "#1C1C1A", fontSize: 15, fontWeight: "700" },
  ctaAdjust: { backgroundColor: "#1C1C1A", borderRadius: 8, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#C0632A" },
  ctaAdjustText: { color: "#C0632A", fontSize: 15, fontWeight: "700" },
});
