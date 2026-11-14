// The GUI tree: nodes, parenting, property writes and click handlers.
//
// One store holds the whole tree for a session, the way the HUD store holds its cards,
// because a script's GUI outlives the script that built it: a screen created in one
// context is still on screen when that context is disposed.
//
// Property writes compare before notifying. A script that sets `Position` every frame
// is normal, and re-rendering the overlay for a value that did not change would burn a
// frame budget on nothing.

import { guiDefaults, isButtonClass, isDecorationClass, type GuiClass, type GuiNode } from './guiTypes';

type ClickHandler = () => void;

export class GuiTreeStore {
  private nodes = new Map<string, GuiNode>();
  private clicks = new Map<string, Set<ClickHandler>>();
  private listeners = new Set<() => void>();
  private nextId = 1;
  private revision = 0;
  private rootId = '';

  constructor() {
    this.reset();
  }

  /** The root a ScreenGui hangs from. Created once, never destroyed by a script. */
  get playerGuiId(): string {
    return this.rootId;
  }

  /** Bumped on every change; the overlay reads it to know when to re-render. */
  get version(): number {
    return this.revision;
  }

  get(id: string): GuiNode | undefined {
    return this.nodes.get(id);
  }

  create(className: GuiClass, name?: string): GuiNode {
    const label = name?.trim() || `${className}_${this.nextId}`;
    const node: GuiNode = {
      ...guiDefaults(className, label),
      id: `gui_${this.nextId}`,
      // Unparented, exactly like the source API: a node that was never parented is
      // not drawn. Auto-attaching would show a frame the script only built as a
      // template and has not placed yet.
      parentId: null
    };
    this.nextId += 1;
    this.nodes.set(node.id, node);
    this.notify();
    return node;
  }

  /** Applies a patch, notifying only when a value actually changed. */
  update(id: string, patch: Partial<GuiNode>): void {
    const node = this.nodes.get(id);
    if (!node) return;
    let changed = false;
    for (const key of Object.keys(patch) as (keyof GuiNode)[]) {
      const next = patch[key];
      if (next === undefined) continue;
      if (node[key] === next) continue;
      // Object values are rebuilt by the reader on every write, so compare by shape.
      if (typeof next === 'object' && JSON.stringify(node[key]) === JSON.stringify(next)) continue;
      (node as unknown as Record<string, unknown>)[key] = next;
      changed = true;
    }
    if (changed) this.notify();
  }

  /**
   * Reparents a node; `null` detaches it, which is what `gui.Parent = nil` means - the
   * node stops being drawn. A node cannot become its own ancestor: the check walks up
   * from the new parent, because a cycle here would make the renderer recurse forever.
   */
  setParent(id: string, parentId: string | null): void {
    const node = this.nodes.get(id);
    if (!node || id === this.rootId) return;

    if (parentId === null) {
      if (node.parentId === null) return;
      node.parentId = null;
      this.notify();
      return;
    }
    if (!this.nodes.has(parentId) || parentId === id) return;

    for (let cursor: GuiNode | undefined = this.nodes.get(parentId); cursor; cursor = cursor.parentId ? this.nodes.get(cursor.parentId) : undefined) {
      if (cursor.id === id) return;
    }
    if (node.parentId === parentId) return;
    node.parentId = parentId;
    this.notify();
  }

  /** Removes a node and everything under it; the handlers go with them. */
  destroy(id: string): void {
    if (id === this.rootId || !this.nodes.has(id)) return;
    for (const child of this.childrenOf(id)) this.destroy(child.id);
    this.nodes.delete(id);
    this.clicks.delete(id);
    this.notify();
  }

  /** The first child of a class. This is how a decoration node is found. */
  childOfClass(parentId: string, className: GuiClass): GuiNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.parentId === parentId && node.className === className) return node;
    }
    return undefined;
  }

  childrenOf(parentId: string): GuiNode[] {
    const children: GuiNode[] = [];
    // Insertion order is creation order, so the array is stable between renders.
    for (const node of this.nodes.values()) {
      if (node.parentId === parentId) children.push(node);
    }
    return children;
  }

  /**
   * The children a layout draws, in the order it draws them. `SortOrder` decides:
   * `LayoutOrder` sorts by the number a script set, `Name` alphabetically. Both are
   * stable, so equal keys keep creation order rather than shuffling between renders.
   */
  arrangedChildrenOf(parentId: string): GuiNode[] {
    const children = this.childrenOf(parentId).filter((node) => !isDecorationClass(node.className));
    const layout = this.childOfClass(parentId, 'UIListLayout') ?? this.childOfClass(parentId, 'UIGridLayout');
    if (!layout) return children;
    if (layout.sortOrder === 'Name') return [...children].sort((a, b) => a.name.localeCompare(b.name));
    return [...children].sort((a, b) => a.layoutOrder - b.layoutOrder);
  }

  /** The ScreenGuis to render. A ScreenGui parented elsewhere still renders. */
  roots(): GuiNode[] {
    return this.childrenOf(this.rootId);
  }

  onClick(id: string, handler: ClickHandler): () => void {
    const set = this.clicks.get(id) ?? new Set<ClickHandler>();
    set.add(handler);
    this.clicks.set(id, set);
    return () => {
      const current = this.clicks.get(id);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.clicks.delete(id);
    };
  }

  fireClick(id: string): void {
    const node = this.nodes.get(id);
    if (!node || !node.visible || !isButtonClass(node.className)) return;
    // Copied first: a handler may destroy the button it was called from.
    for (const handler of [...(this.clicks.get(id) ?? [])]) {
      try {
        handler();
      } catch (error) {
        console.error('GUI click handler failed:', error);
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Drops everything and rebuilds the PlayerGui root. Called when a session ends. */
  reset(): void {
    this.nodes.clear();
    this.clicks.clear();
    // `nextId` deliberately keeps counting. Lua proxies are cached per node id, and a
    // reused id would hand a script the previous session's proxy for a dead node.
    const root: GuiNode = {
      ...guiDefaults('PlayerGui', 'PlayerGui'),
      id: 'gui_root',
      parentId: null
    };
    this.nodes.set(root.id, root);
    this.rootId = root.id;
    this.notify();
  }

  private notify(): void {
    this.revision += 1;
    for (const listener of [...this.listeners]) listener();
  }
}

/** The session-wide tree. Scripts in different contexts share it, as they share the world. */
export const defaultGuiStore = new GuiTreeStore();
