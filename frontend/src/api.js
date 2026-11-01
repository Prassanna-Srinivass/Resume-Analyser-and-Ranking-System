export async function api(path, method = "GET", body) {
  let response;
  try {
    response = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Cannot reach the backend. Start FastAPI and try again.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail
              .map((e) => e.loc.slice(1).join(".") + ": " + e.msg)
              .join("; ")
          : "Request failed. Please try again.",
    );
  }
  return response.status === 204 ? null : response.json();
}
