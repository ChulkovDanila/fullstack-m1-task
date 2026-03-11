export type Side = "left" | "right";

export type PageResponse = {
  items: number[];
  hasMore: boolean;
};

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getItems(side: Side, query: string, offset: number, limit = 20): Promise<PageResponse> {
  const params = new URLSearchParams({
    side,
    query,
    offset: String(offset),
    limit: String(limit),
  });
  const response = await fetch(`/api/items?${params.toString()}`);
  return unwrap<PageResponse>(response);
}

export async function addId(id: number): Promise<{ id: number; status: "added" | "exists" }> {
  const response = await fetch("/api/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return unwrap<{ id: number; status: "added" | "exists" }>(response);
}

export async function setSelection(id: number, selected: boolean): Promise<{ ok: boolean }> {
  const response = await fetch("/api/selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, selected }),
  });
  return unwrap<{ ok: boolean }>(response);
}

export async function reorderSelected(
  movedId: number,
  targetId: number,
  position: "before" | "after"
): Promise<{ ok: boolean }> {
  const response = await fetch("/api/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ movedId, targetId, position }),
  });
  return unwrap<{ ok: boolean }>(response);
}
