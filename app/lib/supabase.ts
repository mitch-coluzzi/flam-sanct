import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";

/**
 * Chunked SecureStore adapter — splits values > 2000 bytes across
 * multiple keys to avoid the 2048 byte limit.
 */
const CHUNK_SIZE = 1800;

const ChunkedSecureStore = {
  getItem: async (key: string): Promise<string | null> => {
    const raw = await SecureStore.getItemAsync(key);
    if (raw !== null) return raw;

    // Check for chunked storage
    const countStr = await SecureStore.getItemAsync(`${key}_chunks`);
    if (!countStr) return null;
    const count = parseInt(countStr, 10);
    const chunks: string[] = [];
    for (let i = 0; i < count; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join("");
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      // Clean up any old chunks
      await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
      return;
    }

    // Chunk it
    const chunks = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${key}_chunks`, String(chunks.length));
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, chunks[i]);
    }
    // Clean up non-chunked key
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },

  removeItem: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key).catch(() => {});
    const countStr = await SecureStore.getItemAsync(`${key}_chunks`);
    if (countStr) {
      const count = parseInt(countStr, 10);
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(`${key}_${i}`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {});
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
