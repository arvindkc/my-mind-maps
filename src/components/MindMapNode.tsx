import { memo, useEffect, useRef } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import type { MindNodeData } from '../types';

type MindFlowNode = Node<MindNodeData, 'mind'>;

function MindMapNode({ id, data, selected }: NodeProps<MindFlowNode>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    if (!data.editing) {
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [data.editing]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      data.onCommitEdit?.(id);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      data.onCommitEdit?.(id);
    }
  };

  const isBranch = data.visualStyle === 'branch';
  const color = data.color ?? '#1f5ce1';
  const side = data.side ?? 'right';

  const nodeStyle = {
    '--mind-color': color
  } as CSSProperties;

  const renderHandles = () => {
    if (side === 'center') {
      return (
        <>
          <Handle type="source" id="source-left" position={Position.Left} />
          <Handle type="source" id="source-right" position={Position.Right} />
          <Handle type="target" id="target-left" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
          <Handle type="target" id="target-right" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
        </>
      );
    }

    if (side === 'left') {
      return (
        <>
          <Handle type="target" id="target-right" position={Position.Right} />
          <Handle type="source" id="source-left" position={Position.Left} />
        </>
      );
    }

    return (
      <>
        <Handle type="target" id="target-left" position={Position.Left} />
        <Handle type="source" id="source-right" position={Position.Right} />
      </>
    );
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      return;
    }

    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      data.onLongPress?.(id);
    }, 480);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      return;
    }
    clearLongPressTimer();
  };

  useEffect(() => () => clearLongPressTimer(), []);

  return (
    <div
      className={`mind-node ${selected ? 'is-selected' : ''} ${isBranch ? 'is-branch' : 'is-boxed'}`}
      style={nodeStyle}
    >
      {renderHandles()}
      {data.editing ? (
        <input
          ref={inputRef}
          data-node-input-id={id}
          autoFocus
          className={`mind-node-input nodrag ${isBranch ? 'is-branch' : ''}`}
          value={data.label}
          onChange={(event) => data.onChangeLabel?.(id, event.target.value)}
          onBlur={() => data.onCommitEdit?.(id)}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <button
          type="button"
          className={`mind-node-label ${isBranch ? 'is-branch' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
          onDoubleClick={() => data.onStartEdit?.(id)}
        >
          {data.label}
        </button>
      )}
    </div>
  );
}

export default memo(MindMapNode);
