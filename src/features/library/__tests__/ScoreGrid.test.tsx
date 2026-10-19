import React from 'react';
import { render } from '@testing-library/react-native';
import { ScoreGrid } from '../ScoreGrid';

// Records the props each FlashList is rendered with; the real list needs native layout.
const mockListProps: Record<string, unknown>[] = [];
jest.mock('@shopify/flash-list', () => ({
  FlashList: (props: Record<string, unknown>) => {
    mockListProps.push(props);
    return null;
  },
}));
jest.mock('@/ui/components', () => ({ ScoreCard: () => null }));
jest.mock('../LibraryParts', () => ({ ScoreRow: () => null }));

const noop = () => {};

describe('ScoreGrid', () => {
  beforeEach(() => {
    mockListProps.length = 0;
  });

  // Regression: with FlashList's default anchoring, scores imported above the viewport left grid
  // cells at stale positions (overlapping cards, an empty slot) until the app restarted.
  it.each(['grid', 'list'] as const)('turns off content anchoring in %s view', async view => {
    await render(<ScoreGrid scores={[]} view={view} selected={new Set()} onPress={noop} onLongPress={noop} onMore={noop} />);
    expect(mockListProps.at(-1)?.maintainVisibleContentPosition).toEqual({ disabled: true });
  });
});
