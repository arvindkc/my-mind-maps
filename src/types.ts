export type MindVisualStyle = 'boxed' | 'branch';
export type MindBranchSide = 'left' | 'right' | 'center';

export type MindNodeData = {
  label: string;
  editing?: boolean;
  color?: string;
  side?: MindBranchSide;
  visualStyle?: MindVisualStyle;
  onChangeLabel?: (nodeId: string, nextLabel: string) => void;
  onStartEdit?: (nodeId: string) => void;
  onCommitEdit?: (nodeId: string) => void;
  onLongPress?: (nodeId: string) => void;
};

export type OutlineItem = {
  text: string;
  depth: number;
};
