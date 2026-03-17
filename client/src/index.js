import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.scss';

// Electron focus fix: native alert()/confirm() steal focus from webContents
// on Windows, causing keyboard input to stop working (Electron bug #20821).
// Replace with Electron's dialog.showMessageBoxSync which doesn't have this bug.
// Uses synchronous IPC (sendSync) so alert()/confirm() remain blocking.
const _origAlert = window.alert;
const _origConfirm = window.confirm;
window.alert = function patchedAlert(message) {
    if (window.electronAPI?.alertSync) {
        window.electronAPI.alertSync(message);
    } else {
        _origAlert.call(window, message);
    }
};
window.confirm = function patchedConfirm(message) {
    if (window.electronAPI?.confirmSync) {
        return window.electronAPI.confirmSync(message);
    }
    return _origConfirm.call(window, message);
};

import router from './router';
import {RouterProvider} from 'react-router-dom';
import './i18n'; // Import i18n configuration

import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(

    <RouterProvider router={router}/>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
