import React, { createRef } from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key })
}));

import CustomModal from './index';

describe('CustomModal', () => {
    it('renders modal with title when show is true', () => {
        render(<CustomModal show={true} handleClose={jest.fn()} title="Test Title" rowList={[]} />);
        expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('does not render when show is false', () => {
        const { container } = render(<CustomModal show={false} handleClose={jest.fn()} title="Test" rowList={[]} />);
        expect(container.querySelector('.modal.show')).toBeNull();
    });

    it('renders label items', () => {
        const rowList = [[{ type: 'label', text: 'Name', colWidth: 4 }]];
        render(<CustomModal show={true} handleClose={jest.fn()} title="T" rowList={rowList} />);
        expect(screen.getByText('Name')).toBeInTheDocument();
    });

    it('renders text items', () => {
        const rowList = [[{ type: 'text', key: 'val', text: 'Hello World', colWidth: 8 }]];
        render(<CustomModal show={true} handleClose={jest.fn()} title="T" rowList={rowList} />);
        expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('renders input and handles onChange', () => {
        const rowList = [[{ type: 'input', key: 'name', inputType: 'text', colWidth: 8, placeholder: 'Enter name' }]];
        render(<CustomModal show={true} handleClose={jest.fn()} title="T" rowList={rowList} />);
        const input = screen.getByPlaceholderText('Enter name');
        fireEvent.change(input, { target: { value: 'Alice' } });
        expect(input.value).toBe('Alice');
    });

    it('renders select and handles onChange', () => {
        const rowList = [[{
            type: 'select', key: 'opt', colWidth: 8,
            options: [{ value: 'a', text: 'Option A' }, { value: 'b', text: 'Option B' }],
            defaultValue: 'a'
        }]];
        render(<CustomModal show={true} handleClose={jest.fn()} title="T" rowList={rowList} />);
        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'b' } });
        expect(select.value).toBe('b');
    });

    it('renders button and handles click', () => {
        const clickFn = jest.fn();
        const rowList = [[{ type: 'button', text: 'Submit', colWidth: 4, click: clickFn }]];
        render(<CustomModal show={true} handleClose={jest.fn()} title="T" rowList={rowList} />);
        fireEvent.click(screen.getByText('Submit'));
        expect(clickFn).toHaveBeenCalled();
    });

    it('renders progress bar', () => {
        const rowList = [[{ type: 'progress', key: 'prog', colWidth: 8 }]];
        const { container } = render(<CustomModal show={true} handleClose={jest.fn()} title="T" rowList={rowList} />);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('exposes ref methods', () => {
        const ref = createRef();
        const rowList = [[{ type: 'input', key: 'name', inputType: 'text', colWidth: 8, placeholder: 'Enter', defaultValue: 'initial' }]];
        render(<CustomModal ref={ref} show={true} handleClose={jest.fn()} title="T" rowList={rowList} />);
        expect(ref.current.getValue('name')).toBe('initial');
        act(() => {
            ref.current.updateValueObj('name', 'updated');
        });
        expect(ref.current.getValue('name')).toBe('updated');
        act(() => {
            ref.current.clearValueObj();
        });
        expect(ref.current.getValue('name')).toBeUndefined();
    });

    it('calls handleData callback on input change', () => {
        const handleData = jest.fn();
        const rowList = [[{ type: 'input', key: 'field', inputType: 'text', colWidth: 8, placeholder: 'Enter' }]];
        render(<CustomModal show={true} handleClose={jest.fn()} title="T" rowList={rowList} handleData={handleData} />);
        fireEvent.change(screen.getByPlaceholderText('Enter'), { target: { value: 'val' } });
        expect(handleData).toHaveBeenCalledWith('field', 'val');
    });

    it('handles onChange override in input item', () => {
        const rowList = [[{
            type: 'input', key: 'num', inputType: 'text', colWidth: 8, placeholder: 'Enter',
            onChange: (e, val) => val.toUpperCase()
        }]];
        render(<CustomModal show={true} handleClose={jest.fn()} title="T" rowList={rowList} />);
        const input = screen.getByPlaceholderText('Enter');
        fireEvent.change(input, { target: { value: 'abc' } });
        expect(input.value).toBe('ABC');
    });

    it('renders multiple select with add/remove', () => {
        const rowList = [[{
            type: 'select', key: 'multi', colWidth: 8, multiple: true,
            options: [{ value: 'x', text: 'X' }, { value: 'y', text: 'Y' }],
            defaultValue: []
        }]];
        render(<CustomModal show={true} handleClose={jest.fn()} title="T" rowList={rowList} />);
        fireEvent.click(screen.getByText('X'));
        expect(screen.getByText(/customModal.selected/)).toBeInTheDocument();
        // Click again to deselect
        fireEvent.click(screen.getByText('X'));
    });
});
