import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface Post {
  id: string;
  body: string | null;
  reaction_count: number;
  reply_count: number;
  created_at: string;
  user_id: string;
  author: { display_name: string | null; full_name: string } | null;
  user_reacted?: boolean;
}

interface Reply {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author: { display_name: string | null; full_name: string } | null;
}

export default function CommunityScreen() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [posting, setPosting] = useState(false);

  // Reply state
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => { loadFeed(); }, [userId]);

  const loadFeed = async () => {
    if (!userId) return;
    setLoading(true);

    const { data } = await supabase
      .from("community_posts")
      .select("*, author:users!community_posts_user_id_fkey(display_name, full_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(30);

    const postIds = (data || []).map((p) => p.id);
    const { data: reactions } = await supabase
      .from("community_reactions")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", postIds);
    const reactedSet = new Set((reactions || []).map((r) => r.post_id));

    setPosts((data || []).map((p) => ({ ...p, user_reacted: reactedSet.has(p.id) })));
    setLoading(false);
  };

  const createPost = async () => {
    if (!userId || !newBody.trim()) return;
    setPosting(true);
    await supabase.from("community_posts").insert({ user_id: userId, body: newBody.trim() });
    setNewBody("");
    setShowCompose(false);
    setPosting(false);
    loadFeed();
  };

  const toggleFlam = async (post: Post) => {
    if (!userId) return;
    if (post.user_reacted) {
      await supabase.from("community_reactions").delete().eq("post_id", post.id).eq("user_id", userId);
      await supabase.from("community_posts").update({ reaction_count: Math.max(post.reaction_count - 1, 0) }).eq("id", post.id);
    } else {
      await supabase.from("community_reactions").insert({ post_id: post.id, user_id: userId, reaction: "flam" });
      await supabase.from("community_posts").update({ reaction_count: post.reaction_count + 1 }).eq("id", post.id);
    }
    loadFeed();
  };

  const toggleReplies = useCallback(async (postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      setReplies([]);
      setReplyText("");
      return;
    }
    setExpandedPostId(postId);
    setLoadingReplies(true);
    const { data } = await supabase
      .from("community_replies")
      .select("id, body, created_at, user_id, author:users!community_replies_user_id_fkey(display_name, full_name)")
      .eq("post_id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    setReplies(data || []);
    setLoadingReplies(false);
  }, [expandedPostId]);

  const sendReply = async () => {
    if (!userId || !expandedPostId || !replyText.trim()) return;
    setSendingReply(true);
    await supabase.from("community_replies").insert({
      post_id: expandedPostId,
      user_id: userId,
      body: replyText.trim(),
    });
    // Increment reply_count on post
    const post = posts.find((p) => p.id === expandedPostId);
    if (post) {
      await supabase.from("community_posts").update({ reply_count: post.reply_count + 1 }).eq("id", expandedPostId);
    }
    setReplyText("");
    setSendingReply(false);
    // Reload replies and feed
    toggleReplies(expandedPostId);
    setTimeout(() => toggleReplies(expandedPostId), 100);
    loadFeed();
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const renderPost = ({ item }: { item: Post }) => {
    const isExpanded = expandedPostId === item.id;
    return (
      <View style={st.postCard}>
        <View style={st.postHeader}>
          <Text style={st.authorName}>{item.author?.display_name || item.author?.full_name || "PAX"}</Text>
          <Text style={st.timeAgo}>{timeAgo(item.created_at)}</Text>
        </View>
        {item.body && <Text style={st.postBody}>{item.body}</Text>}
        <View style={st.postActions}>
          <TouchableOpacity style={st.actionBtn} onPress={() => toggleFlam(item)}>
            <Ionicons name="flame" size={18} color={item.user_reacted ? "#C0632A" : "#5C5A54"} />
            <Text style={[st.actionText, item.user_reacted && { color: "#C0632A" }]}>{item.reaction_count}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.actionBtn} onPress={() => toggleReplies(item.id)}>
            <Ionicons name="chatbubble-outline" size={16} color={isExpanded ? "#C0632A" : "#5C5A54"} />
            <Text style={[st.actionText, isExpanded && { color: "#C0632A" }]}>{item.reply_count}</Text>
          </TouchableOpacity>
        </View>

        {/* Reply thread */}
        {isExpanded && (
          <View style={st.replySection}>
            {loadingReplies ? (
              <ActivityIndicator size="small" color="#C0632A" style={{ marginVertical: 12 }} />
            ) : (
              <>
                {replies.length === 0 && (
                  <Text style={st.noReplies}>No replies yet.</Text>
                )}
                {replies.map((r) => (
                  <View key={r.id} style={st.replyCard}>
                    <View style={st.replyHeader}>
                      <Text style={st.replyAuthor}>{r.author?.display_name || r.author?.full_name || "PAX"}</Text>
                      <Text style={st.replyTime}>{timeAgo(r.created_at)}</Text>
                    </View>
                    <Text style={st.replyBody}>{r.body}</Text>
                  </View>
                ))}
                <View style={st.replyInputRow}>
                  <TextInput
                    style={st.replyInput}
                    placeholder="Reply..."
                    placeholderTextColor="#5C5A54"
                    value={replyText}
                    onChangeText={setReplyText}
                    maxLength={300}
                  />
                  <TouchableOpacity
                    style={[st.replySend, (!replyText.trim() || sendingReply) && { opacity: 0.4 }]}
                    onPress={sendReply}
                    disabled={!replyText.trim() || sendingReply}
                  >
                    {sendingReply ? (
                      <ActivityIndicator size="small" color="#1C1C1A" />
                    ) : (
                      <Ionicons name="send" size={16} color="#1C1C1A" />
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={st.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#C0632A" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderPost}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={<Text style={st.empty}>No posts yet. Be the first.</Text>}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={st.fab} onPress={() => setShowCompose(true)}>
        <Ionicons name="add" size={28} color="#1C1C1A" />
      </TouchableOpacity>

      {/* Compose Modal */}
      <Modal visible={showCompose} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={st.modal}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>New Post</Text>
              <TouchableOpacity onPress={() => setShowCompose(false)}>
                <Ionicons name="close" size={24} color="#9C9A94" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={st.composeInput}
              placeholder="What's on your mind?"
              placeholderTextColor="#5C5A54"
              value={newBody}
              onChangeText={setNewBody}
              multiline
              maxLength={500}
              autoFocus
            />
            <Text style={st.charCount}>{newBody.length}/500</Text>
            <TouchableOpacity style={[st.cta, posting && { opacity: 0.6 }]} onPress={createPost} disabled={posting}>
              {posting ? <ActivityIndicator color="#1C1C1A" /> : <Text style={st.ctaText}>Post</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A" },
  postCard: { backgroundColor: "#2E2D2A", marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: "#3D3C38" },
  postHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  authorName: { fontSize: 14, fontWeight: "700", color: "#F0EDE6" },
  timeAgo: { fontSize: 12, color: "#5C5A54" },
  postBody: { fontSize: 15, color: "#F0EDE6", lineHeight: 22 },
  postActions: { flexDirection: "row", gap: 20, marginTop: 12, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: "#3D3C38" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 13, color: "#5C5A54", fontWeight: "600" },
  empty: { color: "#5C5A54", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 60 },
  fab: { position: "absolute", bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: "#C0632A", justifyContent: "center", alignItems: "center", elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#2E2D2A", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#F0EDE6" },
  composeInput: { backgroundColor: "#1C1C1A", color: "#F0EDE6", borderRadius: 8, padding: 14, fontSize: 15, minHeight: 100, textAlignVertical: "top", borderWidth: 0.5, borderColor: "#5C5A54" },
  charCount: { fontSize: 12, color: "#5C5A54", textAlign: "right", marginTop: 4 },
  cta: { backgroundColor: "#C0632A", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 12 },
  ctaText: { color: "#1C1C1A", fontSize: 15, fontWeight: "700" },
  // Reply styles
  replySection: { marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#3D3C38" },
  noReplies: { color: "#5C5A54", fontSize: 13, fontStyle: "italic", marginBottom: 10 },
  replyCard: { backgroundColor: "#252422", borderRadius: 8, padding: 10, marginBottom: 8 },
  replyHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  replyAuthor: { fontSize: 12, fontWeight: "700", color: "#C0632A" },
  replyTime: { fontSize: 11, color: "#5C5A54" },
  replyBody: { fontSize: 14, color: "#F0EDE6", lineHeight: 20 },
  replyInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  replyInput: { flex: 1, backgroundColor: "#1C1C1A", color: "#F0EDE6", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderWidth: 0.5, borderColor: "#5C5A54" },
  replySend: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#C0632A", justifyContent: "center", alignItems: "center" },
});
