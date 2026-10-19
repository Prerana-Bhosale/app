import { act, fireEvent, render } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React from 'react';
import { Alert } from 'react-native';

import { getMyIncidentReports, submitIncidentReport } from '@/services/firebase/incident.service';
import { useAuthStore } from '@/stores/auth.store';
import IncidentReportScreen from '@app/incident-report';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  hasServicesEnabledAsync: jest.fn(() => Promise.resolve(true)),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({
      coords: { latitude: 19.076, longitude: 72.8777, accuracy: 5 },
      timestamp: Date.now(),
    }),
  ),
  Accuracy: { Balanced: 3 },
}));

jest.mock('@/services/firebase/incident.service', () => ({
  getMyIncidentReports: jest.fn(() => Promise.resolve([])),
  submitIncidentReport: jest.fn(() =>
    Promise.resolve({
      id: 'r1',
      userId: 'user-1',
      title: 'Followed',
      description: 'Followed near the station platform',
      latitude: 19.076,
      longitude: 72.8777,
      photoUrls: [],
      status: 'submitted',
      createdAt: { toDate: () => new Date() },
    }),
  ),
  uploadIncidentPhoto: jest.fn(),
}));

const authSnapshot = useAuthStore.getState();

describe('IncidentReportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ ...authSnapshot, user: { uid: 'user-1' } as never });
  });

  it('renders without crashing', async () => {
    const { getByText } = await render(<IncidentReportScreen />);
    expect(getByText('Report an Incident')).toBeTruthy();
  });

  it('shows the form fields and the photo picker', async () => {
    const { getByText, getByPlaceholderText } = await render(<IncidentReportScreen />);
    expect(getByPlaceholderText('e.g. Harassment near Metro Station')).toBeTruthy();
    expect(
      getByPlaceholderText(
        'Describe the incident in detail. Include time, location details, and description of the person(s) involved.',
      ),
    ).toBeTruthy();
    expect(getByText('Submit Report')).toBeTruthy();
  });

  it('fills the form and submits a report once the location is available', async () => {
    const { getByPlaceholderText, getByText } = await render(<IncidentReportScreen />);

    // Let the mount-effect location fetch resolve.
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await fireEvent.changeText(
        getByPlaceholderText('e.g. Harassment near Metro Station'),
        'Followed',
      );
      await fireEvent.changeText(
        getByPlaceholderText(
          'Describe the incident in detail. Include time, location details, and description of the person(s) involved.',
        ),
        'Followed near the station platform',
      );
    });

    await act(async () => {
      await fireEvent.press(getByText('Submit Report'));
    });

    expect(submitIncidentReport).toHaveBeenCalledWith('user-1', {
      title: 'Followed',
      description: 'Followed near the station platform',
      latitude: 19.076,
      longitude: 72.8777,
      photoUrls: [],
    });
  });

  async function fillAndSubmit(
    getByPlaceholderText: (text: string) => unknown,
    getByText: (text: string) => unknown,
  ): Promise<void> {
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await fireEvent.changeText(
        getByPlaceholderText('e.g. Harassment near Metro Station') as never,
        'Followed',
      );
      await fireEvent.changeText(
        getByPlaceholderText(
          'Describe the incident in detail. Include time, location details, and description of the person(s) involved.',
        ) as never,
        'Followed near the station platform',
      );
    });
    await act(async () => {
      await fireEvent.press(getByText('Submit Report') as never);
    });
  }

  it('refuses to submit with a previously captured location once location is off', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByPlaceholderText, getByText } = await render(<IncidentReportScreen />);
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValueOnce(false);

    await fillAndSubmit(getByPlaceholderText, getByText);

    expect(submitIncidentReport).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Location is turned off. Turn on location services to report from where you are.',
    );
    alertSpy.mockRestore();
  });

  it("shows thumbnails for a submitted report's photos and opens them", async () => {
    jest.mocked(getMyIncidentReports).mockResolvedValueOnce([
      {
        id: 'r1',
        userId: 'user-1',
        title: 'Followed',
        description: 'Followed near the station platform',
        latitude: 19.076,
        longitude: 72.8777,
        photoUrls: ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
        status: 'submitted',
        createdAt: { toDate: () => new Date() },
      } as never,
    ]);
    const { getByText, findByLabelText, getByLabelText } = await render(<IncidentReportScreen />);

    await act(async () => {
      await fireEvent.press(getByText('History'));
    });

    expect(await findByLabelText('View photo 1 of 2')).toBeTruthy();
    await act(async () => {
      await fireEvent.press(getByLabelText('View photo 2 of 2'));
    });
    expect(getByLabelText('Close')).toBeTruthy();
  });

  it('shows a retryable error instead of an empty history when loading fails', async () => {
    jest.mocked(getMyIncidentReports).mockRejectedValueOnce(new Error('failed-precondition'));
    const { getByText, findByText } = await render(<IncidentReportScreen />);

    await act(async () => {
      await fireEvent.press(getByText('History'));
    });

    expect(await findByText("Couldn't load your reports")).toBeTruthy();
  });

  it('switches to the history tab and shows the empty state with no reports', async () => {
    const { getByText } = await render(<IncidentReportScreen />);

    await act(async () => {
      await fireEvent.press(getByText('History'));
    });

    expect(getMyIncidentReports).toHaveBeenCalledWith('user-1');
    expect(getByText('No reports yet')).toBeTruthy();
  });

  it('renders guest empty state when switching to history tab as a guest', async () => {
    useAuthStore.setState({ user: null, isGuest: true });
    const { getByText, findByText } = await render(<IncidentReportScreen />);

    await act(async () => {
      await fireEvent.press(getByText('History'));
    });

    expect(await findByText('Sign in to view your reports')).toBeTruthy();
    expect(getMyIncidentReports).not.toHaveBeenCalled();
  });

  it('allows picking multiple photos in a single selection and previews draft photo', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///photo1.jpg', width: 100, height: 100 },
        { uri: 'file:///photo2.jpg', width: 100, height: 100 },
      ],
    } as never);

    const { getByLabelText, findAllByLabelText } = await render(<IncidentReportScreen />);
    await act(async () => {
      await fireEvent.press(getByLabelText('Add a photo'));
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsMultipleSelection: true,
        selectionLimit: 5,
      }),
    );

    const draftPreviews = await findAllByLabelText('Preview photo');
    expect(draftPreviews).toHaveLength(2);
    await act(async () => {
      await fireEvent.press(draftPreviews[0]!);
    });
    expect(getByLabelText('Close')).toBeTruthy();
  });
});
