# Tests

This folder contains Playwright test scaffolding.

## Quick start
1) Install Playwright:
   - npm i -D @playwright/test
   - npx playwright install
2) Start backend server (port 30001):
   - yarn dev
3) Start frontend dev server (port 3000):
   - yarn start
4) Run tests with the config in this folder:
   - npx playwright test -c test/playwright.config.js

## Notes
- Update `baseURL` in `playwright.config.js` if your app runs on a different port.
- Replace the sample test with real test cases.
