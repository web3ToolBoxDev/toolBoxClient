import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockApi = {
    getAllWallets: jest.fn()
};

jest.mock('../../utils/api', () => ({
    __esModule: true,
    default: { getInstance: () => mockApi }
}));

import ChooseWalletModal from './index';

describe('ChooseWalletModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockApi.getAllWallets.mockResolvedValue([
            { id: '1', name: 'Wallet A', address: '0xaaa', selected: false },
            { id: '2', name: 'Wallet B', address: '0xbbb', selected: false }
        ]);
    });

    it('renders wallet list when shown', async () => {
        render(<ChooseWalletModal show={true} onHide={jest.fn()} confirm={jest.fn()} />);
        expect(await screen.findByText('Wallet A')).toBeInTheDocument();
        expect(screen.getByText('Wallet B')).toBeInTheDocument();
        expect(screen.getByText('0xaaa')).toBeInTheDocument();
    });

    it('select all toggles all checkboxes', async () => {
        render(<ChooseWalletModal show={true} onHide={jest.fn()} confirm={jest.fn()} />);
        await screen.findByText('Wallet A');
        const checkboxes = screen.getAllByRole('checkbox');
        // First is select all
        fireEvent.click(checkboxes[0]);
        fireEvent.click(checkboxes[0]);
    });

    it('individual checkbox toggles selection', async () => {
        render(<ChooseWalletModal show={true} onHide={jest.fn()} confirm={jest.fn()} />);
        await screen.findByText('Wallet A');
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[1]); // select first wallet
        fireEvent.click(checkboxes[1]); // deselect
    });

    it('普通执行 button calls confirm without proxy', async () => {
        const confirm = jest.fn();
        render(<ChooseWalletModal show={true} onHide={jest.fn()} confirm={confirm} />);
        await screen.findByText('Wallet A');
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[1]); // select first wallet
        fireEvent.click(screen.getByText('普通执行'));
        expect(confirm).toHaveBeenCalled();
        const selected = confirm.mock.calls[0][0];
        expect(selected.length).toBe(1);
        expect(selected[0].useProxy).toBe(false);
    });

    it('代理执行 button calls confirm with proxy', async () => {
        const confirm = jest.fn();
        render(<ChooseWalletModal show={true} onHide={jest.fn()} confirm={confirm} />);
        await screen.findByText('Wallet A');
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]); // select all
        fireEvent.click(screen.getByText('代理执行'));
        expect(confirm).toHaveBeenCalled();
        const selected = confirm.mock.calls[0][0];
        expect(selected.every(w => w.useProxy)).toBe(true);
    });
});
