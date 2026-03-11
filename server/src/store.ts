export const BASE_MAX_ID = 1_000_000;
export const PAGE_SIZE = 20;

export type Side = "left" | "right";
export type AddStatus = "added" | "exists";

const selectedOrder: number[] = [];
const selectedSet = new Set<number>();
const extraIds = new Set<number>();

export function parseId(input: unknown): number | null {
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export function addId(id: number): AddStatus {
  if (id <= BASE_MAX_ID || extraIds.has(id)) {
    return "exists";
  }
  extraIds.add(id);
  return "added";
}

export function setSelected(id: number, selected: boolean): boolean {
  if (!idExists(id)) {
    return false;
  }
  if (selected) {
    if (!selectedSet.has(id)) {
      selectedSet.add(id);
      selectedOrder.push(id);
    }
    return true;
  }
  selectedSet.delete(id);
  const index = selectedOrder.indexOf(id);
  if (index !== -1) {
    selectedOrder.splice(index, 1);
  }
  return true;
}

export function reorderSelected(movedId: number, targetId: number, position: "before" | "after"): boolean {
  if (movedId === targetId) {
    return false;
  }
  if (!selectedSet.has(movedId) || !selectedSet.has(targetId)) {
    return false;
  }
  const fromIndex = selectedOrder.indexOf(movedId);
  const targetIndexInitial = selectedOrder.indexOf(targetId);
  if (fromIndex === -1 || targetIndexInitial === -1) {
    return false;
  }
  selectedOrder.splice(fromIndex, 1);
  let targetIndex = selectedOrder.indexOf(targetId);
  if (position === "after") {
    targetIndex += 1;
  }
  selectedOrder.splice(targetIndex, 0, movedId);
  return true;
}

export function getItems(side: Side, query: string, offset: number, limit = PAGE_SIZE): { items: number[]; hasMore: boolean } {
  if (side === "right") {
    return collectRight(query, offset, limit);
  }
  return collectLeft(query, offset, limit);
}

function idExists(id: number): boolean {
  return id <= BASE_MAX_ID || extraIds.has(id);
}

function matchQuery(id: number, query: string): boolean {
  if (!query) {
    return true;
  }
  return String(id).includes(query);
}

function collectRight(query: string, offset: number, limit: number): { items: number[]; hasMore: boolean } {
  const filtered: number[] = [];
  for (const id of selectedOrder) {
    if (matchQuery(id, query)) {
      filtered.push(id);
    }
  }
  const page = filtered.slice(offset, offset + limit + 1);
  const hasMore = page.length > limit;
  if (hasMore) {
    page.pop();
  }
  return { items: page, hasMore };
}

function collectLeft(query: string, offset: number, limit: number): { items: number[]; hasMore: boolean } {
  const items: number[] = [];
  let skipped = 0;

  for (let id = 1; id <= BASE_MAX_ID; id += 1) {
    if (selectedSet.has(id)) {
      continue;
    }
    if (!matchQuery(id, query)) {
      continue;
    }
    if (skipped < offset) {
      skipped += 1;
      continue;
    }
    items.push(id);
    if (items.length > limit) {
      break;
    }
  }

  if (items.length <= limit) {
    for (const id of extraIds) {
      if (selectedSet.has(id)) {
        continue;
      }
      if (!matchQuery(id, query)) {
        continue;
      }
      if (skipped < offset) {
        skipped += 1;
        continue;
      }
      items.push(id);
      if (items.length > limit) {
        break;
      }
    }
  }

  const hasMore = items.length > limit;
  if (hasMore) {
    items.pop();
  }
  return { items, hasMore };
}
