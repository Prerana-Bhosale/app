import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

import { ImageViewer } from '@/components/features/community/ImageViewer';

describe('ImageViewer', () => {
  it('renders nothing when the uri is null', async () => {
    const { queryByLabelText } = await render(<ImageViewer uri={null} onClose={jest.fn()} />);
    expect(queryByLabelText('Close')).toBeNull();
  });

  it('closes when the backdrop is pressed', async () => {
    const onClose = jest.fn();
    const { getByLabelText } = await render(<ImageViewer uri="https://img/x" onClose={onClose} />);

    await fireEvent.press(getByLabelText('Close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when images array is empty', async () => {
    const { queryByLabelText } = await render(<ImageViewer images={[]} onClose={jest.fn()} />);
    expect(queryByLabelText('Close')).toBeNull();
  });

  it('paginates between multiple images with indicators and controls', async () => {
    const { getByLabelText, getByText } = await render(
      <ImageViewer
        images={['https://img/1', 'https://img/2']}
        initialIndex={0}
        onClose={jest.fn()}
      />,
    );

    expect(getByText('1 / 2')).toBeTruthy();
    expect(getByLabelText('Previous image').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    await fireEvent.press(getByLabelText('Next image'));
    expect(getByText('2 / 2')).toBeTruthy();
    expect(getByLabelText('Next image').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    await fireEvent.press(getByLabelText('Previous image'));
    expect(getByText('1 / 2')).toBeTruthy();
  });
});
