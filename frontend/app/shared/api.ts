export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) throw new Error("API error");
  return res.json();
}
