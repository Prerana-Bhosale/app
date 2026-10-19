import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import LawsScreen from '@app/laws';

const mockGetLaws = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/services/firebase/laws.service', () => ({
  getLaws: (...args: unknown[]) => mockGetLaws(...args),
}));

const LAWS = [
  {
    id: 'law_1',
    title: 'Domestic Violence Act',
    shortDescription: 'Protects women at home.',
    fullContent: 'Full text.',
    category: 'Domestic Safety',
    tags: ['abuse'],
    order: 1,
    isPublished: true,
  },
  {
    id: 'law_2',
    title: 'Workplace Harassment Act',
    shortDescription: 'Internal Complaints Committee.',
    fullContent: 'Full text.',
    category: 'Workplace Safety',
    tags: ['workplace'],
    order: 2,
    isPublished: true,
  },
];

describe('LawsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLaws.mockResolvedValue(LAWS);
  });

  it('renders the search field, an All chip, and the law list', async () => {
    const { getByPlaceholderText, getByText } = await render(<LawsScreen />);
    expect(getByPlaceholderText('Search')).toBeTruthy();
    expect(getByText('All')).toBeTruthy();
    expect(getByText('Domestic Violence Act')).toBeTruthy();
    expect(getByText('Workplace Harassment Act')).toBeTruthy();
  });

  it('filters the list by search query', async () => {
    const { getByPlaceholderText, getByText, queryByText } = await render(<LawsScreen />);
    await fireEvent.changeText(getByPlaceholderText('Search'), 'workplace');
    expect(getByText('Workplace Harassment Act')).toBeTruthy();
    expect(queryByText('Domestic Violence Act')).toBeNull();
  });

  it('finds laws by their category name (BUG-022)', async () => {
    const { getByPlaceholderText, getByText, queryByText } = await render(<LawsScreen />);
    await fireEvent.changeText(getByPlaceholderText('Search'), 'Domestic Safety');
    expect(getByText('Domestic Violence Act')).toBeTruthy();
    expect(queryByText('Workplace Harassment Act')).toBeNull();
  });

  it('derives the category chips from the laws', async () => {
    const { getAllByText } = await render(<LawsScreen />);
    expect(getAllByText('Workplace Safety').length).toBeGreaterThan(0);
  });

  it('renders empty state without search subtitle when no laws exist initially', async () => {
    mockGetLaws.mockResolvedValue([]);
    const { getByText, queryByText } = await render(<LawsScreen />);
    expect(getByText('No laws found')).toBeTruthy();
    expect(queryByText('Try a different search term or category')).toBeNull();
  });

  it('renders empty state with search subtitle when search query has no match', async () => {
    const { getByPlaceholderText, getByText } = await render(<LawsScreen />);
    await fireEvent.changeText(getByPlaceholderText('Search'), 'nonexistent query 123');
    expect(getByText('No laws found')).toBeTruthy();
    expect(getByText('Try a different search term or category')).toBeTruthy();
  });
});
