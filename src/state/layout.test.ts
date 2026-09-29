import { describe, expect, it } from 'vitest';
import { calculatePaneLayout, resizePane } from './layout';

const defaults = {
  width: 1280,
  leftWidth: 250,
  rightWidth: 220,
  leftVisible: true,
  rightVisible: true
};

describe('responsive desktop panes', () => {
  it('uses preferred widths at 1280px and shrinks both panes at 1024px', () => {
    expect(calculatePaneLayout(defaults)).toMatchObject({
      leftWidth: 250,
      rightWidth: 220
    });
    const layout = calculatePaneLayout({ ...defaults, width: 1024 });
    expect(layout.leftWidth).toBeGreaterThanOrEqual(180);
    expect(layout.leftWidth).toBeLessThan(250);
    expect(layout.rightWidth).toBeGreaterThanOrEqual(180);
    expect(layout.rightWidth).toBeLessThan(220);
    expect(layout.leftWidth + layout.rightWidth + 8 + 560).toBeCloseTo(1024);
  });

  it('temporarily hides only the outline at 900px and restores saved widths when enlarged', () => {
    const saved = { ...defaults };
    expect(calculatePaneLayout({ ...saved, width: 900 })).toMatchObject({
      leftVisible: true,
      leftWidth: 250,
      rightVisible: false,
      rightWidth: 0,
      outlineAutoClosed: true
    });
    expect(calculatePaneLayout(saved)).toMatchObject({
      leftWidth: 250,
      rightWidth: 220,
      rightVisible: true
    });
    expect(saved).toEqual(defaults);
  });

  it('fits both minimum widths exactly at the collapse boundary', () => {
    expect(calculatePaneLayout({ ...defaults, width: 928 })).toMatchObject({
      leftWidth: 180,
      rightWidth: 180,
      outlineAutoClosed: false
    });
    expect(calculatePaneLayout({ ...defaults, width: 927 }).outlineAutoClosed).toBe(true);
  });

  it('can show the outline at 900px after the file pane is manually closed', () => {
    expect(calculatePaneLayout({ ...defaults, width: 900, leftVisible: false })).toMatchObject({
      leftWidth: 0,
      rightWidth: 220,
      rightVisible: true,
      outlineAutoClosed: false
    });
    expect(calculatePaneLayout({ ...defaults, rightVisible: false })).toMatchObject({
      rightVisible: false,
      outlineAutoClosed: false
    });
  });

  it('respects available space with maximum preferred widths', () => {
    for (const width of [900, 1024, 1280]) {
      const layout = calculatePaneLayout({
        ...defaults,
        width,
        leftWidth: 460,
        rightWidth: 400
      });
      const dividers = (Number(layout.leftVisible) + Number(layout.rightVisible)) * 4;
      expect(layout.leftWidth + layout.rightWidth + dividers).toBeLessThanOrEqual(width - 560 + 0.001);
    }
  });

  it('resizes from displayed widths without a second proportional shrink', () => {
    const layout = calculatePaneLayout({ ...defaults, width: 1024 });
    const resized = resizePane(layout, 'left', layout.leftWidth - 16);
    const result = calculatePaneLayout({
      ...defaults,
      ...resized,
      width: 1024
    });
    expect(result.leftWidth).toBeCloseTo(layout.leftWidth - 16);
    expect(result.rightWidth).toBeCloseTo(layout.rightWidth);
    expect(resizePane(layout, 'left', 900).leftWidth).toBeCloseTo(layout.leftMaxWidth);
    expect(resizePane(layout, 'right', 0).rightWidth).toBe(180);
    expect(resizePane(calculatePaneLayout({ ...defaults, width: 900 }), 'left', 280)).not.toHaveProperty(
      'rightWidth'
    );
  });
});
