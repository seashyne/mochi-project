// Pure query operations for inspecting layout tree nodes.

import type { LayoutNode, SplitNode, StudioPanelId, TabPaneNode } from './layoutTypes';

export function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === 'split';
}

export function isPaneNode(node: LayoutNode): node is TabPaneNode {
  return node.type === 'pane';
}

export function cloneTree<T extends LayoutNode>(node: T): T {
  return JSON.parse(JSON.stringify(node));
}

let idCounter = 1;
export function generateNodeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;
}

export function findNodeById(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  if (isSplitNode(root)) {
    const foundFirst = findNodeById(root.first, id);
    if (foundFirst) return foundFirst;
    return findNodeById(root.second, id);
  }
  return null;
}

export function findPaneByPanelId(root: LayoutNode, panelId: StudioPanelId): TabPaneNode | null {
  if (isPaneNode(root)) {
    return root.tabs.includes(panelId) ? root : null;
  }
  const foundFirst = findPaneByPanelId(root.first, panelId);
  if (foundFirst) return foundFirst;
  return findPaneByPanelId(root.second, panelId);
}

export function findParentNode(
  root: LayoutNode,
  targetId: string
): { parent: SplitNode; childKey: 'first' | 'second' } | null {
  if (isPaneNode(root)) return null;

  if (root.first.id === targetId) {
    return { parent: root, childKey: 'first' };
  }
  if (root.second.id === targetId) {
    return { parent: root, childKey: 'second' };
  }

  const inFirst = findParentNode(root.first, targetId);
  if (inFirst) return inFirst;

  return findParentNode(root.second, targetId);
}

export function getAllPanes(root: LayoutNode): TabPaneNode[] {
  if (isPaneNode(root)) {
    return [root];
  }
  return [...getAllPanes(root.first), ...getAllPanes(root.second)];
}

export function getAllPanels(root: LayoutNode): StudioPanelId[] {
  const panes = getAllPanes(root);
  const panels: StudioPanelId[] = [];
  for (const pane of panes) {
    for (const tab of pane.tabs) {
      if (!panels.includes(tab)) {
        panels.push(tab);
      }
    }
  }
  return panels;
}

export function countLeaves(root: LayoutNode): number {
  if (isPaneNode(root)) return 1;
  return countLeaves(root.first) + countLeaves(root.second);
}
