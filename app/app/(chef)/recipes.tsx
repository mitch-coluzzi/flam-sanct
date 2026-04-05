import { View, Text, StyleSheet } from "react-native";
export default function RecipesScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>Recipes</Text>
      <Text style={s.sub}>Coming next session</Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A", padding: 24, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "800", color: "#F0EDE6", marginBottom: 8 },
  sub: { fontSize: 14, color: "#9C9A94" },
});
