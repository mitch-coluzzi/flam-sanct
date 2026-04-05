import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface Conversation {
  id: string;
  other_name: string;
  other_role: string | null;
  last_message: string | null;
  last_time: string | null;
  unread: number;
}

interface Message {
  id: string;
  body: string | null;
  sender_id: string;
  message_type: string;
  created_at: string;
}

export default function MessagesScreen() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { if (userId) loadConversations(); }, [userId]);

  const loadConversations = async () => {
    if (!userId) return;
    setLoading(true);

    // Get my conversation IDs
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId);
    const convIds = (parts || []).map((p) => p.conversation_id);

    if (convIds.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convos: Conversation[] = [];
    for (const cid of convIds) {
      // Other participant
      const { data: others } = await supabase
        .from("conversation_participants")
        .select("user_id, user:users(display_name, full_name, role)")
        .eq("conversation_id", cid)
        .neq("user_id", userId);
      const other = others?.[0]?.user;

      // Last message
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("body, created_at")
        .eq("conversation_id", cid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      // Unread
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", cid)
        .neq("sender_id", userId)
        .is("read_at", null)
        .is("deleted_at", null);

      convos.push({
        id: cid,
        other_name: (other as any)?.display_name || (other as any)?.full_name || "Unknown",
        other_role: (other as any)?.role || null,
        last_message: lastMsg?.[0]?.body || null,
        last_time: lastMsg?.[0]?.created_at || null,
        unread: count || 0,
      });
    }

    convos.sort((a, b) => (b.last_time || "").localeCompare(a.last_time || ""));
    setConversations(convos);
    setLoading(false);
  };

  const openConversation = async (conv: Conversation) => {
    setActiveConv(conv);
    if (!userId) return;

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(50);
    setMessages(data || []);

    // Mark as read
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conv.id)
      .neq("sender_id", userId)
      .is("read_at", null);
  };

  const sendMessage = async () => {
    if (!userId || !activeConv || !newMsg.trim()) return;
    setSending(true);
    await supabase.from("messages").insert({
      conversation_id: activeConv.id,
      sender_id: userId,
      body: newMsg.trim(),
      message_type: "text",
    });
    setNewMsg("");
    setSending(false);
    openConversation(activeConv);
  };

  const timeAgo = (ts: string | null) => {
    if (!ts) return "";
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  // ── Conversation View ──
  if (activeConv) {
    return (
      <KeyboardAvoidingView
        style={st.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={st.convHeader}>
          <TouchableOpacity onPress={() => { setActiveConv(null); loadConversations(); }}>
            <Ionicons name="arrow-back" size={24} color="#F0EDE6" />
          </TouchableOpacity>
          <Text style={st.convName}>{activeConv.other_name}</Text>
          {activeConv.other_role === "chef" && (
            <View style={st.chefBadge}><Text style={st.chefBadgeText}>CHEF</Text></View>
          )}
        </View>

        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          renderItem={({ item }) => (
            <View style={[st.bubble, item.sender_id === userId ? st.bubbleMine : st.bubbleTheirs]}>
              <Text style={[st.bubbleText, item.message_type === "system" && st.systemText]}>
                {item.body}
              </Text>
            </View>
          )}
        />

        <View style={st.inputBar}>
          <TextInput
            style={st.msgInput}
            placeholder="Message..."
            placeholderTextColor="#5C5A54"
            value={newMsg}
            onChangeText={setNewMsg}
          />
          <TouchableOpacity
            style={[st.sendBtn, (!newMsg.trim() || sending) && { opacity: 0.4 }]}
            onPress={sendMessage}
            disabled={!newMsg.trim() || sending}
          >
            <Ionicons name="arrow-up" size={20} color="#1C1C1A" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Conversation List ──
  return (
    <View style={st.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#C0632A" style={{ marginTop: 40 }} />
      ) : conversations.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={st.empty}>No conversations yet.</Text>
          <Text style={st.emptySub}>Your chef will appear here when assigned.</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={st.convCard} onPress={() => openConversation(item)}>
              <View style={st.convRow}>
                <View style={{ flex: 1 }}>
                  <View style={st.convNameRow}>
                    <Text style={st.convListName}>{item.other_name}</Text>
                    {item.other_role === "chef" && (
                      <View style={st.chefBadgeSmall}><Text style={st.chefBadgeTextSmall}>CHEF</Text></View>
                    )}
                  </View>
                  {item.last_message && (
                    <Text style={st.lastMsg} numberOfLines={1}>{item.last_message}</Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={st.convTime}>{timeAgo(item.last_time)}</Text>
                  {item.unread > 0 && (
                    <View style={st.unreadBadge}><Text style={st.unreadText}>{item.unread}</Text></View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A" },
  convCard: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "#3D3C38" },
  convRow: { flexDirection: "row", justifyContent: "space-between" },
  convNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  convListName: { fontSize: 16, fontWeight: "600", color: "#F0EDE6" },
  lastMsg: { fontSize: 14, color: "#9C9A94", marginTop: 3 },
  convTime: { fontSize: 12, color: "#5C5A54" },
  unreadBadge: { backgroundColor: "#C0632A", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4 },
  unreadText: { color: "#1C1C1A", fontSize: 12, fontWeight: "700" },
  chefBadgeSmall: { backgroundColor: "#3D3C38", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chefBadgeTextSmall: { fontSize: 10, fontWeight: "700", color: "#C0632A", letterSpacing: 1 },
  empty: { color: "#5C5A54", fontSize: 16, fontWeight: "600" },
  emptySub: { color: "#5C5A54", fontSize: 14, marginTop: 4 },
  // Conversation view
  convHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#3D3C38" },
  convName: { fontSize: 18, fontWeight: "700", color: "#F0EDE6" },
  chefBadge: { backgroundColor: "#3D3C38", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  chefBadgeText: { fontSize: 11, fontWeight: "700", color: "#C0632A", letterSpacing: 1 },
  bubble: { maxWidth: "80%", borderRadius: 12, padding: 12, marginBottom: 8 },
  bubbleMine: { backgroundColor: "#C0632A", alignSelf: "flex-end" },
  bubbleTheirs: { backgroundColor: "#2E2D2A", alignSelf: "flex-start" },
  bubbleText: { fontSize: 15, color: "#F0EDE6" },
  systemText: { fontStyle: "italic", color: "#9C9A94" },
  inputBar: { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: "#3D3C38", backgroundColor: "#1C1C1A" },
  msgInput: { flex: 1, backgroundColor: "#2E2D2A", color: "#F0EDE6", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#C0632A", justifyContent: "center", alignItems: "center" },
});
