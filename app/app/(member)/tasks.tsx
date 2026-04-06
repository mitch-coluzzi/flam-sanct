import { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, Alert, Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../store/auth";
import { supabase } from "../../lib/supabase";

interface Task {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
}

export default function TasksScreen() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  // Inline add
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  useEffect(() => { if (userId) loadTasks(); }, [userId]);

  const loadTasks = async () => {
    if (!userId) return;
    setLoading(true);

    const { data: active } = await supabase
      .from("tasks").select("*")
      .eq("user_id", userId).eq("completed", false)
      .order("sort_order").order("created_at", { ascending: false });
    setTasks(active || []);

    const { data: done } = await supabase
      .from("tasks").select("*")
      .eq("user_id", userId).eq("completed", true)
      .order("completed_at", { ascending: false })
      .limit(50);
    setCompletedTasks(done || []);

    setLoading(false);
  };

  const addTask = async () => {
    if (!userId || !newTitle.trim()) return;
    const minOrder = tasks.length > 0 ? Math.min(...tasks.map((t) => t.sort_order)) - 1 : 0;
    await supabase.from("tasks").insert({
      user_id: userId,
      title: newTitle.trim(),
      sort_order: minOrder,
    });
    setNewTitle("");
    loadTasks();
  };

  const toggleTask = async (task: Task) => {
    const now = new Date().toISOString();
    await supabase.from("tasks").update({
      completed: !task.completed,
      completed_at: !task.completed ? now : null,
      updated_at: now,
    }).eq("id", task.id);
    loadTasks();
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await supabase.from("tasks").update({
      title: editTitle.trim(),
      description: editDesc.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", editingId);
    setEditingId(null);
    Keyboard.dismiss();
    loadTasks();
  };

  const deleteTask = (task: Task) => {
    Alert.alert("Delete task?", task.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("tasks").delete().eq("id", task.id);
          loadTasks();
        },
      },
    ]);
  };

  const moveTask = async (task: Task, direction: "up" | "down") => {
    const idx = tasks.findIndex((t) => t.id === task.id);
    if (direction === "up" && idx <= 0) return;
    if (direction === "down" && idx >= tasks.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const other = tasks[swapIdx];

    await supabase.from("tasks").update({ sort_order: other.sort_order }).eq("id", task.id);
    await supabase.from("tasks").update({ sort_order: task.sort_order }).eq("id", other.id);
    loadTasks();
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDesc(task.description || "");
  };

  const renderTask = ({ item, index }: { item: Task; index: number }) => {
    if (editingId === item.id) {
      return (
        <View style={st.taskCard}>
          <TextInput
            style={st.editInput}
            value={editTitle}
            onChangeText={setEditTitle}
            autoFocus
            onSubmitEditing={saveEdit}
            returnKeyType="done"
          />
          <TextInput
            style={[st.editInput, st.editDesc]}
            value={editDesc}
            onChangeText={setEditDesc}
            placeholder="Description (optional)"
            placeholderTextColor="#5C5A54"
            multiline
          />
          <View style={st.editActions}>
            <TouchableOpacity style={st.saveBtn} onPress={saveEdit}>
              <Text style={st.saveBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingId(null)}>
              <Text style={st.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={st.taskCard}>
        <View style={st.taskRow}>
          <TouchableOpacity onPress={() => toggleTask(item)} style={st.checkbox}>
            <Ionicons
              name={item.completed ? "checkbox" : "square-outline"}
              size={24}
              color={item.completed ? "#C0632A" : "#5C5A54"}
            />
          </TouchableOpacity>
          <TouchableOpacity style={st.taskContent} onPress={() => startEdit(item)} onLongPress={() => deleteTask(item)}>
            <Text style={[st.taskTitle, item.completed && st.taskDone]}>{item.title}</Text>
            {item.description && <Text style={st.taskDesc}>{item.description}</Text>}
          </TouchableOpacity>
          {!item.completed && (
            <View style={st.reorderBtns}>
              <TouchableOpacity onPress={() => moveTask(item, "up")} disabled={index === 0}>
                <Ionicons name="chevron-up" size={18} color={index === 0 ? "#3D3C38" : "#9C9A94"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveTask(item, "down")} disabled={index === tasks.length - 1}>
                <Ionicons name="chevron-down" size={18} color={index === tasks.length - 1 ? "#3D3C38" : "#9C9A94"} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return <View style={[st.container, { justifyContent: "center", alignItems: "center" }]}>
      <ActivityIndicator size="large" color="#C0632A" />
    </View>;
  }

  return (
    <View style={st.container}>
      {/* Inline add */}
      <View style={st.addRow}>
        <TouchableOpacity onPress={() => inputRef.current?.focus()}>
          <Ionicons name="add-circle" size={28} color="#C0632A" />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={st.addInput}
          placeholder="Add a task..."
          placeholderTextColor="#5C5A54"
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={addTask}
          returnKeyType="done"
        />
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        renderItem={renderTask}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListEmptyComponent={<Text style={st.empty}>Nothing to do. You know what to do.</Text>}
        ListFooterComponent={
          completedTasks.length > 0 ? (
            <View>
              <TouchableOpacity style={st.completedToggle} onPress={() => setShowCompleted(!showCompleted)}>
                <Ionicons name={showCompleted ? "chevron-down" : "chevron-forward"} size={18} color="#5C5A54" />
                <Text style={st.completedLabel}>Completed ({completedTasks.length})</Text>
              </TouchableOpacity>
              {showCompleted && completedTasks.map((t) => (
                <View key={t.id} style={st.taskCard}>
                  <View style={st.taskRow}>
                    <TouchableOpacity onPress={() => toggleTask(t)} style={st.checkbox}>
                      <Ionicons name="checkbox" size={24} color="#5C5A54" />
                    </TouchableOpacity>
                    <TouchableOpacity style={st.taskContent} onLongPress={() => deleteTask(t)}>
                      <Text style={st.taskDone}>{t.title}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 16 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16, backgroundColor: "#2E2D2A", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: "#5C5A54" },
  addInput: { flex: 1, color: "#F0EDE6", fontSize: 16, paddingVertical: 6 },
  taskCard: { backgroundColor: "#2E2D2A", borderRadius: 10, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, borderColor: "#3D3C38" },
  taskRow: { flexDirection: "row", alignItems: "flex-start" },
  checkbox: { marginRight: 10, marginTop: 1 },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 16, color: "#F0EDE6", lineHeight: 22 },
  taskDesc: { fontSize: 13, color: "#9C9A94", marginTop: 2, lineHeight: 18 },
  taskDone: { fontSize: 16, color: "#5C5A54", textDecorationLine: "line-through" },
  reorderBtns: { marginLeft: 8, justifyContent: "center", gap: 2 },
  editInput: { backgroundColor: "#1C1C1A", color: "#F0EDE6", borderRadius: 6, padding: 10, fontSize: 15, borderWidth: 0.5, borderColor: "#5C5A54", marginBottom: 6 },
  editDesc: { minHeight: 50, textAlignVertical: "top" },
  editActions: { flexDirection: "row", gap: 12, alignItems: "center" },
  saveBtn: { backgroundColor: "#C0632A", borderRadius: 6, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnText: { color: "#1C1C1A", fontWeight: "700", fontSize: 14 },
  cancelText: { color: "#9C9A94", fontSize: 14 },
  empty: { color: "#5C5A54", fontSize: 14, fontStyle: "italic", textAlign: "center", marginTop: 40 },
  completedToggle: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: "#3D3C38", marginTop: 8 },
  completedLabel: { fontSize: 14, color: "#5C5A54", fontWeight: "600" },
});
