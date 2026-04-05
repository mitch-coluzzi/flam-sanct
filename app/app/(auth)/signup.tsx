import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Link } from "expo-router";
import { supabase } from "../../lib/supabase";

export default function SignupScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!fullName || !email || !password) return;
    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert(
        "Check your email",
        "We sent a confirmation link. Tap it to activate your account.",
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={s.inner}>
        <Text style={s.brand}>FlamSanct</Text>
        <Text style={s.tagline}>Join the practice.</Text>

        <TextInput
          style={s.input}
          placeholder="Full name"
          placeholderTextColor="#9C9A94"
          value={fullName}
          onChangeText={setFullName}
          textContentType="name"
        />
        <TextInput
          style={s.input}
          placeholder="Email"
          placeholderTextColor="#9C9A94"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextInput
          style={s.input}
          placeholder="Password (8+ characters)"
          placeholderTextColor="#9C9A94"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
        />

        <TouchableOpacity
          style={[s.button, loading && s.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#1C1C1A" />
          ) : (
            <Text style={s.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={s.linkWrap}>
            <Text style={s.linkText}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C1C1A" },
  inner: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  brand: {
    fontSize: 36,
    fontWeight: "900",
    color: "#C0632A",
    textAlign: "center",
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    color: "#9C9A94",
    textAlign: "center",
    marginBottom: 48,
    fontStyle: "italic",
  },
  input: {
    backgroundColor: "#2E2D2A",
    color: "#F0EDE6",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#5C5A54",
  },
  button: {
    backgroundColor: "#C0632A",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#1C1C1A", fontSize: 16, fontWeight: "700" },
  linkWrap: { marginTop: 20, alignItems: "center" },
  linkText: { color: "#C0632A", fontSize: 14 },
});
