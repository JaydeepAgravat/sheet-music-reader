import { clampAxis, rubberAxis, visibleTile, zoomAround } from '../zoom';

describe('zoom geometry', () => {
  it('centres content smaller than the stage and clamps larger content to the edges', () => {
    expect(clampAxis(50, 1, 800, 1000)).toBe(100);
    expect(clampAxis(50, 2, 800, 1000)).toBe(0);
    expect(clampAxis(-900, 2, 800, 1000)).toBe(-600);
  });

  it('rubber-bands past the edge with resistance', () => {
    const r = rubberAxis(100, 2, 800, 1000);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(100);
  });

  it('keeps the focal point fixed when zooming', () => {
    const t1 = zoomAround(300, 0, 1, 2);
    // content point under x=300 before: 300; after: 300*2 + t1 must still be 300.
    expect(300 * 2 + t1).toBe(300);
  });

  it('reports the visible part of each two-up page', () => {
    // Stage 1000×600, content 1000×600 at 2× scrolled to the right half.
    const left = visibleTile({ x: 0, y: 0, width: 500, height: 600 }, 1000, 600, 2, -1000, 0);
    const right = visibleTile({ x: 500, y: 0, width: 500, height: 600 }, 1000, 600, 2, -1000, 0);
    expect(left).toMatchObject({ left: 1, right: 1 }); // off screen: empty range
    expect(right).toMatchObject({ left: 0, right: 1, top: 0, bottom: 0.5 });
  });
});
