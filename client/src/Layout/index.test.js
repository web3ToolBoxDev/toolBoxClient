import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
        i18n: { changeLanguage: jest.fn() }
    })
}));

const mockFetchFingerPrints = jest.fn();
jest.mock('../store/fingerPrintStore', () => ({
    __esModule: true,
    default: (selector) => selector({ fetchFingerPrints: mockFetchFingerPrints })
}));

jest.mock('../components/taskOffcanvas', () => {
    return function MockTaskOffcanvas({ show }) {
        return show ? <div data-testid="task-offcanvas">TaskOffcanvas</div> : null;
    };
});

// Mock react-bootstrap Offcanvas to avoid useMediaQuery issues in jsdom
jest.mock('react-bootstrap/Offcanvas', () => {
    const React = require('react');
    const MockOffcanvas = ({ show, onHide, children, className }) => {
        if (!show) return null;
        return React.createElement('div', { className: `offcanvas ${className || ''}`, 'data-testid': 'offcanvas' },
            children
        );
    };
    MockOffcanvas.Header = ({ children, closeButton }) =>
        React.createElement('div', { className: 'offcanvas-header' }, children);
    MockOffcanvas.Title = ({ children }) =>
        React.createElement('div', { className: 'offcanvas-title' }, children);
    MockOffcanvas.Body = ({ children, className }) =>
        React.createElement('div', { className: `offcanvas-body ${className || ''}` }, children);
    return { __esModule: true, default: MockOffcanvas };
});

jest.mock('../utils/api', () => ({
    __esModule: true,
    default: {
        getInstance: () => ({
            getFingerPrintCount: jest.fn().mockResolvedValue({ success: true, message: 0 }),
            setStateLanguage: jest.fn().mockResolvedValue({ success: true })
        })
    }
}));

import Layout from './index';
import { eventEmitter } from '../utils/eventEmitter';

describe('Layout', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        window.localStorage.clear();
        Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true, configurable: true });
    });

    const DummyChild = () => <div data-testid="child">Child Content</div>;

    it('renders child component and sidebar', () => {
        render(<Layout Child={DummyChild} />);
        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.getByText('Web3ToolBox')).toBeInTheDocument();
    });

    it('renders all menu items', () => {
        render(<Layout Child={DummyChild} />);
        expect(screen.getByTitle('introduction')).toBeInTheDocument();
        expect(screen.getByTitle('chromeManage')).toBeInTheDocument();
        expect(screen.getByTitle('walletManage')).toBeInTheDocument();
        expect(screen.getByTitle('syncFunction')).toBeInTheDocument();
        expect(screen.getByTitle('taskManage')).toBeInTheDocument();
    });

    it('toggles sidebar collapse', () => {
        render(<Layout Child={DummyChild} />);
        const toggleBtn = screen.getByLabelText('Collapse Navigation');
        fireEvent.click(toggleBtn);
        expect(window.localStorage.getItem('layout.sidebarCollapsed')).toBe('1');
    });

    it('opens task offcanvas on taskExecuted event', () => {
        render(<Layout Child={DummyChild} />);
        expect(screen.queryByTestId('task-offcanvas')).not.toBeInTheDocument();
        act(() => {
            eventEmitter.emit('taskExecuted');
        });
        expect(screen.getByTestId('task-offcanvas')).toBeInTheDocument();
    });

    it('opens task offcanvas on button click', () => {
        render(<Layout Child={DummyChild} />);
        fireEvent.click(screen.getByTestId('task-info-button'));
        expect(screen.getByTestId('task-offcanvas')).toBeInTheDocument();
    });

    it('opens and uses language offcanvas', () => {
        render(<Layout Child={DummyChild} />);
        fireEvent.click(screen.getByTitle('changeLang'));
        expect(screen.getByText('selectLang')).toBeInTheDocument();
        fireEvent.click(screen.getByText('English'));
        expect(window.localStorage.getItem('appLanguage')).toBe('en');
    });

    it('starts collapsed when localStorage has collapsed=1', () => {
        window.localStorage.setItem('layout.sidebarCollapsed', '1');
        render(<Layout Child={DummyChild} />);
        expect(screen.getByLabelText('Expand Navigation')).toBeInTheDocument();
    });

    it('calls fetchFingerPrints on mount', () => {
        render(<Layout Child={DummyChild} />);
        expect(mockFetchFingerPrints).toHaveBeenCalled();
    });
});
