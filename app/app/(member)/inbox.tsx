import { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface AiMessage {
  id: string;
  body: string;
  ai_key_points: string[] | null;
  ai_category: string | null;
  created_at: string;
  conversation_id: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  nutrition: "#C0632A",
  recovery: "#7A6A4A",
  training: "#9A7A3A",
  wellbeing: "#7A5C5C",
  weekly: "#5A7A6A",
};

export default function InboxScreen() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;
  const [insights, setInsights] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (userId) load(); }, [userId]);

  const load = async () => {
    if (!userId) return;
    setLoading(true);

    // Get conversations the member is part of
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId);
    const convIds = (parts || []).map((p: any) => p.conversation_id);

    if (convIds.length === 0) {
      setInsights([]);
      setLoading(false);
      return;
    }

    // All AI messages in those conversations
    const { data } = await supabase
      .from("messages")
      .select("id, body, ai_key_points, ai_category, created_at, conversation_id")
      .in("conversation_id", convIds)
      .eq("message_type", "ai_digest")
      .order("created_at", { ascending: false })
      .limit(50);

    setInsights(data || []);
    setLoading(false);
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color="#C0632A" />
    </View>;
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={s.heading}>FlamSanct Has Noticed</Text>
      <Text style={s.sub}>Things worth your attention.</Text>

      {insights.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="sparkles-outline" size={32} color="#5C5A54" />
          <Text style={s.emptyText}>No insights yet.</Text>
          <Text style={s.emptySub}>FlamSanct surfaces patterns from your daily check-ins as they emerge.</Text>
        </View>
      ) : (
        insights.map((m) => (
          <View key={m.id} style={s.card}>
            <View style={s.cardHeader}>
              {m.ai_category && (
                <Text style={[s.category, { color: CATEGORY_COLORS[m.ai_category] || "#C0632A" }]}>
                  {m.ai_category.toUpperCase()}
                </Text>
              )}
              <Text style={s.time}>{timeAgo(m.created_at)}</Text>
            </View>
            <Text style={s.body}>{m.body}</Text>
            {m.ai_key_points && m.ai_key_points.length > 0 && (
              <View style={s.keyPoints}>
                <Text style={s.keyPointsLabel}>KEY POINTS</Text>
                {m.ai_key_points.map((kp, i) => (
                  <Text key={i} style={s.keyPointText}>• {kp}</Text>
                ))}
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 20 },
  heading: { fontSize: 24, fontWeight: "800", color: "#F0EDE6", marginBottom: 4 },
  sub: { fontSize: 13, color: "#9C9A94", marginBottom: 20 },
  empty: { alignItems: "center", marginTop: 80, paddingHorizontal: 40 },
  emptyText: { color: "#9C9A94", fontSize: 16, fontWeight: "600", marginTop: 16 },
  emptySub: { color: "#5C5A54", fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 18 },
  card: { backgroundColor: "#2E2D2A", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: "#5C5A54" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  category: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  time: { fontSize: 11, color: "#5C5A54" },
  body: { fontSize: 15, color: "#F0EDE6", lineHeight: 22 },
  keyPoints: { marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: "#3D3C38" },
  keyPointsLabel: { fontSize: 10, fontWeight: "700", color: "#C0632A", letterSpacing: 1.5, marginBottom: 6 },
  keyPointText: { fontSize: 13, color: "#F0EDE6", paddingVertical: 2 },
});
