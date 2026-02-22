import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState
} from '@xyflow/react';
import MindMapNode from './MindMapNode';
import { chooseRootChildSide, positionTree } from '../lib/layout';
import type { MindNodeData, MindVisualStyle } from '../types';

type MindFlowNode = Node<MindNodeData, 'mind'>;

type MindMapEditorProps = {
  loadGraph: { nodes: MindFlowNode[]; edges: Edge[] } | null;
  loadVersion: number;
  organizeVersion: number;
  onCreateNewMap: () => void;
  onSnapshotReady: (container: HTMLElement | null) => void;
  onStateChange: (nodes: MindFlowNode[], edges: Edge[]) => void;
  onExportPng: () => void;
};

const BRANCH_COLORS = ['#1f5ce1', '#03a66a', '#c26000', '#ab47bc', '#0d7a88', '#d83b4e'];

const initialNodes: MindFlowNode[] = [
  {
    id: 'root',
    type: 'mind',
    position: { x: 600, y: 360 },
    selected: true,
    data: { label: 'Central Idea', side: 'center' }
  }
];

const initialEdges: Edge[] = [];

const nodeTypes = {
  mind: MindMapNode
} as const;

function getParentId(nodeId: string, edges: Edge[]): string | null {
  return edges.find((edge) => edge.target === nodeId)?.source ?? null;
}

function getChildrenOf(parentId: string, edges: Edge[]): string[] {
  return edges.filter((edge) => edge.source === parentId).map((edge) => edge.target);
}

function getTraversalOrder(nodes: MindFlowNode[], edges: Edge[]): string[] {
  const childrenMap = new Map<string, string[]>();
  const targets = new Set<string>();

  edges.forEach((edge) => {
    targets.add(edge.target);
    const children = childrenMap.get(edge.source) ?? [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
  });

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const roots = nodes.filter((node) => !targets.has(node.id));
  const visited = new Set<string>();
  const order: string[] = [];

  const walk = (id: string): void => {
    if (visited.has(id)) {
      return;
    }

    visited.add(id);
    order.push(id);

    const children = (childrenMap.get(id) ?? []).sort((aId, bId) => {
      const a = nodeMap.get(aId);
      const b = nodeMap.get(bId);
      if (!a || !b) {
        return 0;
      }
      return a.position.y - b.position.y;
    });

    children.forEach((childId) => walk(childId));
  };

  roots.forEach((root) => walk(root.id));

  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      order.push(node.id);
    }
  });

  return order;
}

function createBranchColorLookup(nodes: MindFlowNode[], edges: Edge[]): Map<string, string> {
  const targets = new Set(edges.map((edge) => edge.target));
  const root = nodes.find((node) => !targets.has(node.id)) ?? nodes[0];
  const lookup = new Map<string, string>();

  if (!root) {
    return lookup;
  }

  lookup.set(root.id, '#111827');

  const rootChildren = getChildrenOf(root.id, edges)
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is MindFlowNode => Boolean(node))
    .sort((a, b) => a.position.y - b.position.y);

  const parentByNode = new Map<string, string>();
  edges.forEach((edge) => {
    parentByNode.set(edge.target, edge.source);
  });

  rootChildren.forEach((childNode, index) => {
    lookup.set(childNode.id, BRANCH_COLORS[index % BRANCH_COLORS.length]);
  });

  nodes.forEach((node) => {
    if (lookup.has(node.id)) {
      return;
    }

    let current = node.id;
    let parent = parentByNode.get(current);

    while (parent && parent !== root.id) {
      current = parent;
      parent = parentByNode.get(current);
    }

    if (parent === root.id) {
      lookup.set(node.id, lookup.get(current) ?? BRANCH_COLORS[0]);
    } else {
      lookup.set(node.id, '#1f5ce1');
    }
  });

  return lookup;
}

function getRootId(nodes: MindFlowNode[], edges: Edge[]): string | null {
  const targets = new Set(edges.map((edge) => edge.target));
  return (nodes.find((node) => !targets.has(node.id)) ?? nodes[0])?.id ?? null;
}

export default function MindMapEditor({
  loadGraph,
  loadVersion,
  organizeVersion,
  onCreateNewMap,
  onSnapshotReady,
  onStateChange,
  onExportPng
}: MindMapEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<MindFlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [longPressActionNodeId, setLongPressActionNodeId] = useState<string | null>(null);
  const [visualStyle] = useState<MindVisualStyle>('branch');
  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const didInitialLayoutRef = useRef(false);

  useEffect(() => {
    onSnapshotReady(canvasRef.current);
  }, [onSnapshotReady]);

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!pendingFocusNodeId || editingNodeId !== pendingFocusNodeId) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const focusInput = () => {
      if (cancelled) {
        return;
      }

      const input = canvasRef.current?.querySelector<HTMLInputElement>(
        `[data-node-input-id="${pendingFocusNodeId}"]`
      );

      if (input) {
        input.focus();
        input.select();
        setPendingFocusNodeId(null);
        return;
      }

      attempts += 1;
      if (attempts < 6) {
        window.setTimeout(focusInput, 16);
      }
    };

    focusInput();

    return () => {
      cancelled = true;
    };
  }, [editingNodeId, pendingFocusNodeId]);

  const selectedNodeId = useMemo(
    () => nodes.find((node) => node.selected)?.id ?? nodes[0]?.id ?? null,
    [nodes]
  );

  const selectNode = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === nodeId
        }))
      );
    },
    [setNodes]
  );

  const commitEdit = useCallback(
    (nodeId: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  label: node.data.label.trim() || 'New Topic'
                }
              }
            : node
        )
      );
      setEditingNodeId((current) => (current === nodeId ? null : current));
      window.setTimeout(() => {
        editorRef.current?.focus();
      }, 0);
    },
    [setNodes]
  );

  const updateLabel = useCallback(
    (nodeId: string, nextLabel: string) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  label: nextLabel
                }
              }
            : node
        )
      );
    },
    [setNodes]
  );

  const resolveEdgeHandles = useCallback(
    (
      sourceId: string,
      targetSide: 'left' | 'right',
      rootId: string | null
    ): Pick<Edge, 'sourceHandle' | 'targetHandle'> => {
      const sourceHandle =
        sourceId === rootId ? (targetSide === 'left' ? 'source-left' : 'source-right') : undefined;
      const targetHandle = targetSide === 'left' ? 'target-right' : 'target-left';
      return { sourceHandle, targetHandle };
    },
    []
  );

  const applyLayout = useCallback(
    (nextNodes: MindFlowNode[], nextEdges: Edge[], selectedId: string | null) => {
      const { width, height } = canvasRef.current?.getBoundingClientRect() ?? { width: 1200, height: 720 };
      const arrangedNodes = positionTree(nextNodes, nextEdges, {
        centerX: width * 0.5,
        centerY: height * 0.5,
        canvasWidth: width
      }).map((node) => ({
        ...node,
        selected: selectedId ? node.id === selectedId : false
      }));

      const rootId = getRootId(arrangedNodes, nextEdges);
      const arrangedEdges = nextEdges.map((edge) => {
        const targetNode = arrangedNodes.find((node) => node.id === edge.target);
        const targetSide = targetNode?.data.side === 'left' ? 'left' : 'right';
        return {
          ...edge,
          ...resolveEdgeHandles(edge.source, targetSide, rootId)
        };
      });

      return { arrangedNodes, arrangedEdges };
    },
    [resolveEdgeHandles]
  );

  const addChild = useCallback(
    (parentId: string, startEditing: boolean) => {
      const newId = `node-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const parentNode = nodes.find((node) => node.id === parentId);
      const { width, height } = canvasRef.current?.getBoundingClientRect() ?? { width: 1200, height: 720 };
      const rootId = getRootId(nodes, edges);
      const rootCenterX = nodes.find((node) => node.id === rootId)?.position.x ?? width * 0.5;
      const side =
        parentId === rootId
          ? chooseRootChildSide(parentId, nodes, edges, width, rootCenterX)
          : parentNode?.data.side === 'left'
            ? 'left'
            : 'right';
      const initialX = (parentNode?.position.x ?? width * 0.5) + (side === 'left' ? -140 : 140);
      const initialY = parentNode?.position.y ?? height * 0.5;

      const newNode: MindFlowNode = {
        id: newId,
        type: 'mind',
        selected: true,
        data: { label: 'New Topic', side },
        position: { x: initialX, y: initialY }
      };

      const nextEdges = edges.concat({
        id: `${parentId}-${newId}`,
        source: parentId,
        target: newId,
        type: 'smoothstep'
      });

      const withSelection = [...nodes.map((node) => ({ ...node, selected: false as const })), newNode];
      const { arrangedNodes, arrangedEdges } = applyLayout(withSelection, nextEdges, newId);
      setNodes(arrangedNodes);
      setEdges(arrangedEdges);

      if (startEditing) {
        setEditingNodeId(newId);
        setPendingFocusNodeId(newId);
      }
      setLongPressActionNodeId(null);
    },
    [applyLayout, edges, nodes, setEdges, setNodes]
  );

  useEffect(() => {
    if (loadVersion === 0 || !loadGraph) {
      return;
    }

    const nextNodes = loadGraph.nodes.length > 0 ? loadGraph.nodes : initialNodes;
    const nextEdges = loadGraph.edges;
    const { arrangedNodes, arrangedEdges } = applyLayout(nextNodes, nextEdges, getRootId(nextNodes, nextEdges));
    setNodes(arrangedNodes);
    setEdges(arrangedEdges);
    setEditingNodeId(null);
    setPendingFocusNodeId(null);
    setLongPressActionNodeId(null);
    window.setTimeout(() => {
      editorRef.current?.focus();
    }, 0);
  }, [applyLayout, loadGraph, loadVersion, setEdges, setNodes]);

  const addSibling = useCallback(
    (nodeId: string, startEditing: boolean) => {
      const parentId = getParentId(nodeId, edges);
      if (!parentId) {
        return;
      }

      addChild(parentId, startEditing);
    },
    [addChild, edges]
  );

  const removeNode = useCallback(
    (nodeId: string | null) => {
      if (!nodeId || nodeId === 'root') {
        return;
      }

      const parentId = getParentId(nodeId, edges);
      const childIds = edges
        .filter((edge) => edge.source === nodeId)
        .map((edge) => edge.target);

      const nextNodes = nodes.filter((node) => node.id !== nodeId);
      const baseEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);

      const adoptedEdges =
        parentId === null
          ? []
          : childIds
              .filter(
                (childId) =>
                  !baseEdges.some((edge) => edge.source === parentId && edge.target === childId)
              )
              .map(
                (childId): Edge => ({
                  id: `${parentId}-${childId}`,
                  source: parentId,
                  target: childId,
                  type: 'smoothstep'
                })
              );

      const nextEdges = [...baseEdges, ...adoptedEdges];

      const selectedAfterDelete = parentId ?? nextNodes[0]?.id ?? null;
      const { arrangedNodes, arrangedEdges } = applyLayout(nextNodes, nextEdges, selectedAfterDelete);
      setNodes(arrangedNodes);
      setEdges(arrangedEdges);
      setEditingNodeId(null);
      setLongPressActionNodeId(null);
    },
    [applyLayout, edges, nodes, setEdges, setNodes]
  );

  const removeSelected = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }
    removeNode(selectedNodeId);
  }, [removeNode, selectedNodeId]);

  const moveSelection = useCallback(
    (delta: 1 | -1) => {
      if (nodes.length === 0) {
        return;
      }

      const order = getTraversalOrder(nodes, edges);
      if (order.length === 0) {
        return;
      }

      const currentId = selectedNodeId ?? order[0];
      const currentIndex = Math.max(0, order.indexOf(currentId));
      const nextIndex = Math.min(order.length - 1, Math.max(0, currentIndex + delta));
      selectNode(order[nextIndex]);
    },
    [edges, nodes, selectNode, selectedNodeId]
  );

  const organizeMap = useCallback(() => {
    if (nodes.length === 0) {
      return;
    }

    const rootId = getRootId(nodes, edges);
    const keepSelectedId = selectedNodeId ?? rootId;
    const { arrangedNodes, arrangedEdges } = applyLayout(nodes, edges, keepSelectedId);
    setNodes(arrangedNodes);
    setEdges(arrangedEdges);
    setEditingNodeId(null);
    setPendingFocusNodeId(null);
    setLongPressActionNodeId(null);
  }, [applyLayout, edges, nodes, selectedNodeId, setEdges, setNodes]);

  useEffect(() => {
    if (organizeVersion === 0) {
      return;
    }

    organizeMap();
  }, [organizeMap, organizeVersion]);

  useEffect(() => {
    if (didInitialLayoutRef.current || nodes.length === 0) {
      return;
    }

    didInitialLayoutRef.current = true;
    const rootId = getRootId(nodes, edges);
    const { arrangedNodes, arrangedEdges } = applyLayout(nodes, edges, rootId);
    setNodes(arrangedNodes);
    setEdges(arrangedEdges);
  }, [applyLayout, edges, nodes, setEdges, setNodes]);

  const handleEditorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const typingTarget =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onExportPng();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        onCreateNewMap();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        organizeMap();
        return;
      }

      if (typingTarget) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedNodeId) {
          addChild(selectedNodeId, true);
        }
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        if (!selectedNodeId) {
          return;
        }
        addSibling(selectedNodeId, true);
        return;
      }

      if (event.key === 'F2' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e')) {
        event.preventDefault();
        if (selectedNodeId) {
          setEditingNodeId(selectedNodeId);
        }
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelected();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1);
      }
    },
    [addChild, addSibling, moveSelection, onExportPng, onCreateNewMap, organizeMap, removeSelected, selectedNodeId]
  );

  useEffect(() => {
    onStateChange(nodes, edges);
  }, [edges, nodes, onStateChange]);

  const colorLookup = useMemo(() => createBranchColorLookup(nodes, edges), [edges, nodes]);

  const displayNodes = useMemo<MindFlowNode[]>(
    () =>
      nodes.map((node) => ({
        ...node,
        type: 'mind' as const,
        selected: node.selected ?? false,
        data: {
          ...node.data,
          editing: editingNodeId === node.id,
          visualStyle,
          color: colorLookup.get(node.id),
          onChangeLabel: updateLabel,
          onStartEdit: (id: string) => {
            selectNode(id);
            setEditingNodeId(id);
          },
          onLongPress: (id: string) => {
            selectNode(id);
            setLongPressActionNodeId(id);
          },
          onCommitEdit: commitEdit
        }
      })),
    [colorLookup, commitEdit, editingNodeId, nodes, selectNode, updateLabel, visualStyle]
  );

  const displayEdges = useMemo(() => {
    const isBranch = visualStyle === 'branch';

    return edges.map((edge) => {
      const edgeColor = colorLookup.get(edge.target) ?? '#1f5ce1';
      return {
        ...edge,
        type: isBranch ? 'default' : 'smoothstep',
        animated: false,
        pathOptions: isBranch ? undefined : { borderRadius: 14, offset: 20 },
        style: {
          stroke: edgeColor,
          strokeWidth: isBranch ? 3 : 2
        }
      };
    });
  }, [colorLookup, edges, visualStyle]);

  const canEditSelected = Boolean(selectedNodeId);
  const canAddSibling = Boolean(selectedNodeId && getParentId(selectedNodeId, edges));
  const canDeleteSelected = Boolean(selectedNodeId && selectedNodeId !== 'root');
  const actionNodeId = longPressActionNodeId ?? selectedNodeId;
  const canActionSibling = Boolean(actionNodeId && getParentId(actionNodeId, edges));
  const canActionDelete = Boolean(actionNodeId && actionNodeId !== 'root');

  return (
    <div className="editor-shell" onKeyDown={handleEditorKeyDown} tabIndex={0} ref={editorRef}>
      <div className="editor-canvas" ref={canvasRef}>
        <ReactFlow<MindFlowNode, Edge>
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          deleteKeyCode={null}
          onConnect={(connection) => {
            setEdges((currentEdges) => addEdge(connection, currentEdges));
          }}
          onNodeClick={(_, node) => {
            selectNode(node.id);
          }}
          nodeTypes={nodeTypes}
        >
          <Background />
          <MiniMap pannable zoomable />
          <Controls />
        </ReactFlow>
      </div>
      <div className="mobile-action-bar" role="toolbar" aria-label="Mind map actions">
        <button
          type="button"
          onClick={() => {
            if (selectedNodeId) {
              addChild(selectedNodeId, true);
            }
          }}
          disabled={!canEditSelected}
        >
          + Child
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedNodeId) {
              addSibling(selectedNodeId, true);
            }
          }}
          disabled={!canAddSibling}
        >
          + Sibling
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedNodeId) {
              setEditingNodeId(selectedNodeId);
            }
          }}
          disabled={!canEditSelected}
        >
          Rename
        </button>
        <button type="button" onClick={organizeMap}>
          Organize
        </button>
        <button type="button" onClick={removeSelected} disabled={!canDeleteSelected}>
          Delete
        </button>
      </div>
      {longPressActionNodeId ? (
        <div className="node-action-sheet-backdrop" onClick={() => setLongPressActionNodeId(null)}>
          <div className="node-action-sheet" onClick={(event) => event.stopPropagation()}>
            <h4>Node actions</h4>
            <div className="node-action-grid">
              <button
                type="button"
                onClick={() => {
                  addChild(longPressActionNodeId, true);
                }}
              >
                Add Child
              </button>
              <button
                type="button"
                disabled={!canActionSibling}
                onClick={() => {
                  addSibling(longPressActionNodeId, true);
                }}
              >
                Add Sibling
              </button>
              <button
                type="button"
                onClick={() => {
                  selectNode(longPressActionNodeId);
                  setEditingNodeId(longPressActionNodeId);
                  setLongPressActionNodeId(null);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                disabled={!canActionDelete}
                onClick={() => {
                  removeNode(longPressActionNodeId);
                }}
              >
                Delete
              </button>
            </div>
            <button
              type="button"
              className="node-action-cancel"
              onClick={() => setLongPressActionNodeId(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
