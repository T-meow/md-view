export type PaneSide = 'left' | 'right';

export const MIN_PANE_WIDTH = 180;
export const MIN_DOCUMENT_WIDTH = 560;
export const RESIZER_WIDTH = 4;

type PaneLayoutInput = {
  width: number;
  leftWidth: number;
  rightWidth: number;
  leftVisible: boolean;
  rightVisible: boolean;
};

export function calculatePaneLayout(input: PaneLayoutInput) {
  const width = Math.max(0, input.width);
  const leftVisible = input.leftVisible;
  const outlineAutoClosed =
    input.rightVisible &&
    width < MIN_DOCUMENT_WIDTH + (leftVisible ? 2 : 1) * (MIN_PANE_WIDTH + RESIZER_WIDTH);
  const rightVisible = input.rightVisible && !outlineAutoClosed;
  let leftWidth = leftVisible ? Math.max(MIN_PANE_WIDTH, Math.min(460, input.leftWidth)) : 0;
  let rightWidth = rightVisible ? Math.max(MIN_PANE_WIDTH, Math.min(400, input.rightWidth)) : 0;
  const count = Number(leftVisible) + Number(rightVisible);
  const budget = Math.max(0, width - MIN_DOCUMENT_WIDTH - count * RESIZER_WIDTH);
  const shrinkable = leftWidth + rightWidth - count * MIN_PANE_WIDTH;
  if (leftWidth + rightWidth > budget && shrinkable > 0) {
    const ratio = Math.max(0, (budget - count * MIN_PANE_WIDTH) / shrinkable);
    if (leftVisible) leftWidth = MIN_PANE_WIDTH + (leftWidth - MIN_PANE_WIDTH) * ratio;
    if (rightVisible) rightWidth = MIN_PANE_WIDTH + (rightWidth - MIN_PANE_WIDTH) * ratio;
  }
  return {
    leftWidth,
    rightWidth,
    leftVisible,
    rightVisible,
    outlineAutoClosed,
    leftMaxWidth: Math.max(MIN_PANE_WIDTH, Math.min(460, budget - rightWidth)),
    rightMaxWidth: Math.max(MIN_PANE_WIDTH, Math.min(400, budget - leftWidth))
  };
}

export type PaneLayout = ReturnType<typeof calculatePaneLayout>;

export function resizePane(layout: PaneLayout, side: PaneSide, width: number) {
  const maximum = side === 'left' ? layout.leftMaxWidth : layout.rightMaxWidth;
  // Start from the displayed widths, so constrained panes do not shrink a second time.
  return {
    ...(layout.leftVisible ? { leftWidth: layout.leftWidth } : {}),
    ...(layout.rightVisible ? { rightWidth: layout.rightWidth } : {}),
    [side === 'left' ? 'leftWidth' : 'rightWidth']: Math.max(MIN_PANE_WIDTH, Math.min(maximum, width))
  };
}
