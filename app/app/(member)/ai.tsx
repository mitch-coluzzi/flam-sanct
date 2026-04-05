import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface QueryItem {
  response_text: string;
  created_at: string;
}

export default function AiScreen() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [history, setHistory] = useState<QueryItem[]>([]);
  const [remaining, setRemaining] = useState(10);

  useEffect(() => { if (userId) loadHistory(); }, [userId]);

  const loadHistory = async () => {
    if (!userId) return;
    const today = new Date().toISOString().split("T")[0];

    const { data } = await supabase
      .from("ai_feedback_requests")
      .select("response_text, created_at")
      .eq("user_id", userId)
      .eq("request_type", "on_demand")
      .order("created_at", { ascending: false })
      .limit(5);
    setHistory(data || []);

    // Count today's queries for remaining
    const { count } = await supabase
      .from("ai_feedback_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("request_type", "on_demand")
      .gte("created_at", `${today}T00:00:00`);
    setRemaining(10 - (count || 0));
  };

  const askQuestion = async () => {
    if (!question.trim() || remaining <= 0) return;
    setAsking(true);
    setAnswer("");

    // This will hit the FastAPI endpoint once deployed
    // For now, show a placeholder since Claude API calls need the backend
    setAnswer("The AI feedback layer requires the FastAPI backend to be deployed on Railway. Once live, this screen will connect to POST /v1/ai/query with your full 14-day context.");

    // Log the attempt
    if (userId) {
      await supabase.from("ai_feedback_requests").insert({
        user_id: userId,
        request_type: "on_demand",
        response_text: "[Pending — backend not deployed]",
        tokens_used: 0,
      });
    }

    setAsking(false);
    loadHistory();
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <KeyboardAvoidingView
      style={st.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <Text style={st.heading}>Ask FlamSanct</Text>
        <Text style={st.sub}>{remaining} questions remaining today</Text>

        {/* Answer */}
        {answer ? (
          <View style={st.answerCard}>
            <Text style={st.answerText}>{answer}</Text>
          </View>
        ) : null}

        {/* History */}
        {history.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={st.sectionTitle}>Recent</Text>
            {history.map((h, i) => (
              <View key={i} style={st.historyCard}>
                <Text style={st.historyText}>{h.response_text}</Text>
                <Text style={st.historyTime}>{timeAgo(h.created_at)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={st.inputBar}>
        <TextInput
          style={st.input}
          placeholder="Ask about your data..."
          placeholderTextColor="#5C5A54"
          value={question}
          onChangeText={setQuestion}
          multiline
        />
        <TouchableOpacity
          style={[st.sendBtn, (asking || !question.trim()) && { opacity: 0.4 }]}
          onPress={askQuestion}
          disabled={asking || !question.trim()}
        >
          {asking ? (
            <ActivityIndicator size="small" color="#1C1C1A" />
          ) : (
            <Ionicons name="arrow-up" size={20} color="#1C1C1A" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 20 },
  heading: { fontSize: 24, fontWeight: "800", color: "#F0EDE6", marginBottom: 4 },
  sub: { fontSize: 13, color: "#9C9A94", marginBottom: 20 },
  answerCard: {
    backgroundColor: "#2E2D2A",
    borderRadius: 12,
    padding: 20,
    borderWidth: 0.5,
    borderColor: "#5C5A54",
  },
  answerText: { fontSize: 15, color: "#F0EDE6", lineHeight: 24 },
  sectionTitle: { fontSize: 12, fontWeight: "600", color: "#9C9A94", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  historyCard: {
    backgroundColor: "#2E2D2A",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: "#3D3C38",
  },
  historyText: { fontSize: 14, color: "#9C9A94", lineHeight: 20 },
  historyTime: { fontSize: 11, color: "#5C5A54", marginTop: 6 },
  inputBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 16,
    backgroundColor: "#1C1C1A",
    borderTopWidth: 0.5,
    borderTopColor: "#3D3C38",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#2E2D2A",
    color: "#F0EDE6",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    maxHeight: 80,
    borderWidth: 0.5,
    borderColor: "#5C5A54",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#C0632A",
    justifyContent: "center",
    alignItems: "center",
  },
});
