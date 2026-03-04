import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, fallback) => (typeof fallback === 'string' ? fallback : key)
    })
}));

describe('Introduction page', () => {
    let Introduction;
    const mockOpenLink = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        window.electronAPI = { openLink: mockOpenLink };
        Introduction = require('./index').default;
    });

    afterEach(() => {
        delete window.electronAPI;
    });

    it('renders heading and description', () => {
        render(<Introduction />);
        expect(screen.getByText('Web3ToolBox')).toBeInTheDocument();
    });

    it('renders all four buttons', () => {
        render(<Introduction />);
        expect(screen.getByText('使用说明')).toBeInTheDocument();
        expect(screen.getByText('浏览器')).toBeInTheDocument();
        expect(screen.getByText('github链接')).toBeInTheDocument();
        expect(screen.getByText('twitter')).toBeInTheDocument();
    });

    it('opens introduction link on click', () => {
        render(<Introduction />);
        fireEvent.click(screen.getByText('使用说明'));
        expect(mockOpenLink).toHaveBeenCalledWith('https://youtu.be/Vxxpiq4j8k0');
    });

    it('opens browser link on click', () => {
        render(<Introduction />);
        fireEvent.click(screen.getByText('浏览器'));
        expect(mockOpenLink).toHaveBeenCalledWith('https://web3toolbox.app/');
    });

    it('opens github link on click', () => {
        render(<Introduction />);
        fireEvent.click(screen.getByText('github链接'));
        expect(mockOpenLink).toHaveBeenCalledWith('https://github.com/web3ToolBoxDev/toolBoxClient');
    });

    it('opens twitter link on click', () => {
        render(<Introduction />);
        fireEvent.click(screen.getByText('twitter'));
        expect(mockOpenLink).toHaveBeenCalledWith('https://twitter.com/Web3_1stToolbox');
    });

    it('does not crash when electronAPI is undefined', () => {
        delete window.electronAPI;
        render(<Introduction />);
        fireEvent.click(screen.getByText('使用说明'));
        fireEvent.click(screen.getByText('浏览器'));
        fireEvent.click(screen.getByText('github链接'));
        fireEvent.click(screen.getByText('twitter'));
    });
});
