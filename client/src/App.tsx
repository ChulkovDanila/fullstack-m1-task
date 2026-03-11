import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { addId, getItems, reorderSelected, setSelection } from "./api";
import "./App.css";

type ListState = {
  items: number[];
  offset: number;
  hasMore: boolean;
  loading: boolean;
};

const PAGE_SIZE = 20;

function createListState(): ListState {
  return {
    items: [],
    offset: 0,
    hasMore: true,
    loading: false,
  };
}

function LeftRow(props: {
  id: number;
  actionLabel: string;
  onAction: () => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  actionClassName?: string;
}) {
  const { id, actionLabel, onAction, disabled = false, loading = false, actionClassName = "secondary" } = props;
  return (
    <div className="row" data-id={id}>
      <span>
        <span className="idLabel">ID </span>
        <span className="idValue">{id}</span>
      </span>
      <button className={actionClassName} onClick={() => void onAction()} disabled={disabled}>
        <span className={loading ? "buttonText hiddenText" : "buttonText"}>{actionLabel}</span>
        {loading && <span className="buttonLoader" aria-hidden="true" />}
      </button>
    </div>
  );
}

function RightSortableRow(props: {
  id: number;
  actionLabel: string;
  onAction: () => Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  actionClassName?: string;
}) {
  const { id, actionLabel, onAction, disabled = false, loading = false, actionClassName = "secondary" } = props;
  const sortable = useSortable({ id: String(id) });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.isDragging ? "none" : sortable.transition,
    zIndex: sortable.isDragging ? 10 : 1,
  };
  return (
    <div
      className={sortable.isDragging ? "row sortableRow draggingRow" : "row sortableRow"}
      data-id={id}
      ref={sortable.setNodeRef}
      style={style}
    >
      <button
        className="dragHandle"
        type="button"
        aria-label={`Перетащить ID ${id}`}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        ☰
      </button>
      <span>
        <span className="idLabel">ID </span>
        <span className="idValue">{id}</span>
      </span>
      <button className={actionClassName} onClick={() => void onAction()} disabled={disabled}>
        <span className={loading ? "buttonText hiddenText" : "buttonText"}>{actionLabel}</span>
        {loading && <span className="buttonLoader" aria-hidden="true" />}
      </button>
    </div>
  );
}

function App() {
  const [leftQuery, setLeftQuery] = useState("");
  const [rightQuery, setRightQuery] = useState("");
  const [left, setLeft] = useState<ListState>(createListState);
  const [right, setRight] = useState<ListState>(createListState);
  const [newId, setNewId] = useState("");
  const [activeButtonKey, setActiveButtonKey] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const parsedNewId = Number(newId);
  const canAdd = Number.isSafeInteger(parsedNewId) && parsedNewId > 0;

  useEffect(() => {
    void resetAndLoad("left");
  }, [leftQuery]);

  useEffect(() => {
    void resetAndLoad("right");
  }, [rightQuery]);

  const rightIds = useMemo(() => right.items.map((id) => id.toString()), [right.items]);

  function matchesQuery(id: number, query: string): boolean {
    if (!query) {
      return true;
    }
    return String(id).includes(query);
  }

  async function resetAndLoad(side: "left" | "right"): Promise<void> {
    if (side === "left") {
      setLeft(createListState());
      await loadNext("left", true);
    } else {
      setRight(createListState());
      await loadNext("right", true);
    }
  }

  async function loadNext(side: "left" | "right", forceFromStart = false): Promise<void> {
    if (side === "left") {
      const current = forceFromStart ? createListState() : left;
      if (current.loading || !current.hasMore) {
        return;
      }
      setLeft((prev) => ({ ...prev, loading: true }));
      try {
        const data = await getItems("left", leftQuery, current.offset, PAGE_SIZE);
        setLeft((prev) => ({
          items: forceFromStart ? data.items : [...prev.items, ...data.items],
          offset: (forceFromStart ? 0 : prev.offset) + data.items.length,
          hasMore: data.hasMore,
          loading: false,
        }));
      } catch {
        setLeft((prev) => ({ ...prev, loading: false, hasMore: false }));
      }
      return;
    }

    const current = forceFromStart ? createListState() : right;
    if (current.loading || !current.hasMore) {
      return;
    }
    setRight((prev) => ({ ...prev, loading: true }));
    try {
      const data = await getItems("right", rightQuery, current.offset, PAGE_SIZE);
      setRight((prev) => ({
        items: forceFromStart ? data.items : [...prev.items, ...data.items],
        offset: (forceFromStart ? 0 : prev.offset) + data.items.length,
        hasMore: data.hasMore,
        loading: false,
      }));
    } catch {
      setRight((prev) => ({ ...prev, loading: false, hasMore: false }));
    }
  }

  async function onAdd(): Promise<void> {
    if (!canAdd) {
      return;
    }
    setActiveButtonKey("add");
    try {
      await addId(parsedNewId);
      setNewId("");
      await resetAndLoad("left");
    } finally {
      setActiveButtonKey(null);
    }
  }

  async function onSelect(id: number, selected: boolean): Promise<void> {
    const buttonKey = `select:${id}:${selected ? "1" : "0"}`;
    if (selected) {
      setLeft((prev) => ({ ...prev, items: prev.items.filter((itemId) => itemId !== id) }));
      if (matchesQuery(id, rightQuery)) {
        setRight((prev) => {
          if (prev.items.includes(id)) {
            return prev;
          }
          return { ...prev, items: [...prev.items, id] };
        });
      }
    } else {
      setRight((prev) => ({ ...prev, items: prev.items.filter((itemId) => itemId !== id) }));
      if (matchesQuery(id, leftQuery)) {
        setLeft((prev) => {
          if (prev.items.includes(id)) {
            return prev;
          }
          const next = [...prev.items, id].sort((a, b) => a - b);
          return { ...prev, items: next };
        });
      }
    }

    setActiveButtonKey(buttonKey);
    try {
      await setSelection(id, selected);
    } catch {
      await Promise.all([resetAndLoad("left"), resetAndLoad("right")]);
    } finally {
      setActiveButtonKey(null);
    }
  }

  async function onDragEnd(event: DragEndEvent): Promise<void> {
    const activeId = Number(event.active.id);
    const overId = Number(event.over?.id);
    if (!activeId || !overId || activeId === overId) {
      return;
    }
    const fromIndex = right.items.findIndex((id) => id === activeId);
    const toIndex = right.items.findIndex((id) => id === overId);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    const position: "before" | "after" = fromIndex < toIndex ? "after" : "before";
    const reordered = arrayMove(right.items, fromIndex, toIndex);
    setRight((prev) => ({ ...prev, items: reordered }));
    setIsReordering(true);
    try {
      await reorderSelected(activeId, overId, position);
    } catch {
      await resetAndLoad("right");
    } finally {
      setIsReordering(false);
    }
  }

  function onListScroll(side: "left" | "right", element: HTMLDivElement | null): void {
    if (!element) {
      return;
    }
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < 100) {
      void loadNext(side);
    }
  }

  return (
    <main className="layout">
      <section className="panel">
        <header className="panelHeader">
          <h2>Доступные элементы</h2>
          <div className="controls">
            <input
              value={leftQuery}
              onChange={(event) => setLeftQuery(event.target.value.trim())}
              placeholder="Поиск по ID"
            />
          </div>
          <div className="controls">
            <input
              type="number"
              min={1}
              step={1}
              value={newId}
              onChange={(event) => setNewId(event.target.value)}
              placeholder="Новый ID"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void onAdd();
                }
              }}
            />
            <button
              className="addButton"
              onClick={() => void onAdd()}
              disabled={!canAdd || activeButtonKey === "add"}
            >
              <span className={activeButtonKey === "add" ? "buttonText hiddenText" : "buttonText"}>Добавить</span>
              {activeButtonKey === "add" && <span className="buttonLoader" aria-hidden="true" />}
            </button>
          </div>
        </header>
        <div className="list" onScroll={(event) => onListScroll("left", event.currentTarget)}>
          {left.items.map((id) => (
            <LeftRow
              key={id}
              id={id}
              actionLabel="Выбрать"
              actionClassName="secondary"
              onAction={() => onSelect(id, true)}
              disabled={activeButtonKey === `select:${id}:1`}
              loading={activeButtonKey === `select:${id}:1`}
            />
          ))}
          {!left.loading && left.items.length === 0 && <div className="muted">Ничего не найдено</div>}
          {left.loading && (
            <div className="listLoaderWrap">
              <span className="listLoader" aria-hidden="true" />
            </div>
          )}
          {!left.loading && left.hasMore && left.items.length > 0 && (
            <div className="muted">Прокрутите вниз для загрузки</div>
          )}
        </div>
      </section>

      <section className="panel">
        <header className="panelHeader">
          <h2>Выбранные элементы</h2>
          <div className="controls">
            <input
              value={rightQuery}
              onChange={(event) => setRightQuery(event.target.value.trim())}
              placeholder="Поиск по ID"
            />
          </div>
        </header>
        <div className="list rightList" onScroll={(event) => onListScroll("right", event.currentTarget)}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={(event) => void onDragEnd(event)}
          >
            <SortableContext items={rightIds} strategy={verticalListSortingStrategy}>
              {right.items.map((id) => (
                <RightSortableRow
                  key={id}
                  id={id}
                  actionLabel="Убрать"
                  actionClassName="danger"
                  onAction={() => onSelect(id, false)}
                  disabled={activeButtonKey === `select:${id}:0` || isReordering}
                  loading={activeButtonKey === `select:${id}:0`}
                />
              ))}
            </SortableContext>
          </DndContext>
          {!right.loading && right.items.length === 0 && <div className="muted">Ничего не найдено</div>}
          {right.loading && (
            <div className="listLoaderWrap">
              <span className="listLoader" aria-hidden="true" />
            </div>
          )}
          {!right.loading && right.hasMore && right.items.length > 0 && (
            <div className="muted">Прокрутите вниз для загрузки</div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
