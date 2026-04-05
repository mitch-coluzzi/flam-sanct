import { supabase } from "./supabase";
import { API_BASE_URL } from "./constants";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface ApiResponse<T = any> {
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { timestamp: string };
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function api<T = any>(
  method: Method,
  path: string,
  body?: any,
): Promise<ApiResponse<T>> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return res.json();
}

export async function apiUpload<T = any>(
  path: string,
  formData: FormData,
): Promise<ApiResponse<T>> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  return res.json();
}
