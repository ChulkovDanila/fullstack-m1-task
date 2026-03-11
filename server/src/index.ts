import cors from "cors";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { BatchQueue } from "./queue";
import { addId, getItems, parseId, reorderSelected, setSelected, Side, PAGE_SIZE } from "./store";

type GetPayload = {
  side: Side;
  query: string;
  offset: number;
  limit: number;
};

type SelectionPayload = {
  action: "select";
  id: number;
  selected: boolean;
};

type ReorderPayload = {
  action: "reorder";
  movedId: number;
  targetId: number;
  position: "before" | "after";
};

type WritePayload = SelectionPayload | ReorderPayload;

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

const addQueue = new BatchQueue<{ id: number }, { id: number; status: "added" | "exists" }>(
  10_000,
  (payload) => String(payload.id),
  async (entries) => {
    const result = new Map<string, { id: number; status: "added" | "exists" }>();
    for (const entry of entries) {
      result.set(entry.key, { id: entry.payload.id, status: addId(entry.payload.id) });
    }
    return result;
  }
);

const getQueue = new BatchQueue<GetPayload, { items: number[]; hasMore: boolean }>(
  1_000,
  (payload) => JSON.stringify(payload),
  async (entries) => {
    const result = new Map<string, { items: number[]; hasMore: boolean }>();
    for (const entry of entries) {
      const { side, query, offset, limit } = entry.payload;
      result.set(entry.key, getItems(side, query, offset, limit));
    }
    return result;
  }
);

const writeQueue = new BatchQueue<WritePayload, { ok: boolean }>(
  1_000,
  (payload) => {
    if (payload.action === "select") {
      return `select:${payload.id}:${payload.selected}`;
    }
    return `reorder:${payload.movedId}:${payload.targetId}:${payload.position}`;
  },
  async (entries) => {
    const result = new Map<string, { ok: boolean }>();
    for (const entry of entries) {
      const payload = entry.payload;
      if (payload.action === "select") {
        result.set(entry.key, { ok: setSelected(payload.id, payload.selected) });
      } else {
        result.set(entry.key, { ok: reorderSelected(payload.movedId, payload.targetId, payload.position) });
      }
    }
    return result;
  }
);

app.get("/api/items", async (req, res) => {
  const side: Side = req.query.side === "right" ? "right" : "left";
  const query = String(req.query.query ?? "").trim();
  const offsetRaw = Number(req.query.offset ?? 0);
  const limitRaw = Number(req.query.limit ?? PAGE_SIZE);
  const offset = Number.isSafeInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const limit = Number.isSafeInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, PAGE_SIZE) : PAGE_SIZE;
  try {
    const data = await getQueue.enqueue({ side, query, offset, limit });
    res.json(data);
  } catch {
    res.status(500).json({ error: "failed_to_get_items" });
  }
});

app.post("/api/add", async (req, res) => {
  const id = parseId(req.body?.id);
  if (!id) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  try {
    const data = await addQueue.enqueue({ id });
    res.json(data);
  } catch {
    res.status(500).json({ error: "failed_to_add" });
  }
});

app.post("/api/selection", async (req, res) => {
  const id = parseId(req.body?.id);
  const selected = req.body?.selected;
  if (!id || typeof selected !== "boolean") {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  try {
    const data = await writeQueue.enqueue({ action: "select", id, selected });
    if (!data.ok) {
      res.status(404).json({ error: "id_not_found" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "failed_to_update_selection" });
  }
});

app.post("/api/reorder", async (req, res) => {
  const movedId = parseId(req.body?.movedId);
  const targetId = parseId(req.body?.targetId);
  const position = req.body?.position === "after" ? "after" : "before";
  if (!movedId || !targetId) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  try {
    const data = await writeQueue.enqueue({ action: "reorder", movedId, targetId, position });
    if (!data.ok) {
      res.status(400).json({ error: "invalid_reorder" });
      return;
    }
    res.json(data);
  } catch {
    res.status(500).json({ error: "failed_to_reorder" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const distCandidates = [path.resolve(__dirname, "../../client/dist"), path.resolve(process.cwd(), "client/dist")];
const clientDistPath = distCandidates.find((candidate) => fs.existsSync(candidate));
if (clientDistPath) {
  app.use(express.static(clientDistPath));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.listen(PORT, () => {
  process.stdout.write(`Server started on http://localhost:${PORT}\n`);
});
