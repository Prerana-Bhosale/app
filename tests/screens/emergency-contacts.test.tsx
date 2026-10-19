import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

import { useAuthStore } from '@/stores/auth.store';
import { useUserStore } from '@/stores/user.store';
import EmergencyContactsScreen from '@app/emergency-contacts';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-contacts/legacy', () => ({
  Fields: { PhoneNumbers: 'phoneNumbers' },
  getContactsAsync: jest.fn(() => Promise.resolve({ data: [] })),
}));

const mockGetEmergencyContacts = jest.fn((..._args: unknown[]) => Promise.resolve([] as unknown[]));

jest.mock('@/services/firebase/user.service', () => ({
  getEmergencyContacts: (...args: unknown[]) => mockGetEmergencyContacts(...args),
  addEmergencyContact: jest.fn(),
  updateEmergencyContact: jest.fn(),
  deleteEmergencyContact: jest.fn(),
  DuplicateContactError: class DuplicateContactError extends Error {},
}));

describe('EmergencyContactsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.getState().reset();
    useUserStore.getState().reset();
    mockGetEmergencyContacts.mockResolvedValue([]);
  });

  it('renders the header and the locked helpline list', async () => {
    const { getByText } = await render(<EmergencyContactsScreen />);

    expect(getByText('Emergency Contacts')).toBeTruthy();
    expect(getByText('Helpline Numbers')).toBeTruthy();
    expect(getByText('Police')).toBeTruthy();
    expect(getByText('112')).toBeTruthy();
  });

  it('shows the empty state for custom contacts', async () => {
    const { getByText } = await render(<EmergencyContactsScreen />);

    await waitFor(() => {
      expect(getByText('No emergency contacts added yet')).toBeTruthy();
    });
    expect(getByText('Add your first emergency contact')).toBeTruthy();
  });

  it("loads and lists the signed-in user's saved contacts", async () => {
    useAuthStore.setState({
      surakshakUser: {
        userId: 'u1',
        name: 'Priya',
        phone: '+919999999999',
        profilePhotoUrl: '',
        city: 'Mumbai',
        state: '',
        language: 'en',
        isGuest: false,
        createdAt: {} as never,
        updatedAt: {} as never,
      },
    });
    mockGetEmergencyContacts.mockResolvedValue([
      {
        id: 'c1',
        name: 'Ma',
        phone: '+919876543210',
        relationship: 'Mother',
        isPredefined: false,
        order: 0,
      },
    ] as never);

    const { getByText } = await render(<EmergencyContactsScreen />);

    await waitFor(() => {
      expect(mockGetEmergencyContacts).toHaveBeenCalledWith('u1');
      expect(getByText('Ma')).toBeTruthy();
    });
    expect(getByText('Mother · +919876543210')).toBeTruthy();
  });

  it('shows contactDeleteFailed alert when deletion fails', async () => {
    useAuthStore.setState({
      surakshakUser: {
        userId: 'u1',
        name: 'Priya',
        phone: '+919999999999',
        profilePhotoUrl: '',
        city: 'Mumbai',
        state: '',
        language: 'en',
        isGuest: false,
        createdAt: {} as never,
        updatedAt: {} as never,
      },
    });
    mockGetEmergencyContacts.mockResolvedValue([
      {
        id: 'c1',
        name: 'Ma',
        phone: '+919876543210',
        relationship: 'Mother',
        isPredefined: false,
        order: 0,
      },
    ] as never);

    const deleteMock = jest.requireMock('@/services/firebase/user.service').deleteEmergencyContact;
    deleteMock.mockRejectedValueOnce(new Error('Network error'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const deleteButton = buttons?.find((button) => button.text === 'Delete');
      deleteButton?.onPress?.();
    });

    const { getByLabelText } = await render(<EmergencyContactsScreen />);
    await waitFor(() => {
      expect(getByLabelText('Delete Contact')).toBeTruthy();
    });

    await fireEvent.press(getByLabelText('Delete Contact'));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Could not delete the contact. Please try again.');
    });
  });
});
