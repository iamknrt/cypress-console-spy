# @mknrt/cypress-console-spy

A Cypress plugin to monitor and handle console errors and warnings during tests, with configurable options, whitelisting, and error statistics.

## Installation

```bash
npm install @mknrt/cypress-console-spy
```

## Setup

1. **Register the server part** in `cypress.config.js`:

```javascript
const { defineConfig } = require('cypress');
const { server } = require('cypress-console-spy');

module.exports = defineConfig({
    e2e: {
        setupNodeEvents(on, config) {
            server(on, config);
            return config;
        },
        env: {
            consoleDaemon: {
                stopOnError: true,
                logToFile: true,
                methodsToTrack: ['error', 'warn'],
                throwOnWarning: false,
                whitelist: ['socket.io', /ThirdPartyScript/, 'known warning'],
            },
        },
    },
});
```

2. **Register the client part** in `cypress/support/e2e.js`:

```javascript
const { client } = require('cypress-console-spy');

client(Cypress, Cypress.env('consoleDaemon'));
```

## Core Files

The plugin is built on two main files:

- **server.js**: Handles server-side tasks such as logging console issues, saving them to files, sending notifications, and maintaining error statistics. It defines Cypress tasks like `logConsoleError`, `saveConsoleErrorToFile`, `notifyCriticalError`, `getErrorStats`, `resetErrorStats`, and `setDebugMode`. It also manages events like `before:run` and `after:run` for resetting and summarizing error stats.
- **client.js**: Manages client-side functionality by overriding Cypress's `it`, `it.only`, and `it.skip` functions to integrate console spying. It sets up spies for console methods (e.g., `error`, `warn`), handles uncaught errors, filters issues based on a whitelist, and triggers server-side tasks for logging and notifications.

## Configuration

The plugin supports the following options (via `Cypress.env('consoleDaemon')`):

- `stopOnError` (boolean): Stop the test on console issues (default: `true`).
- `logToFile` (boolean): Save console issues to `console_errors.log` (default: `false`).
- `methodsToTrack` (array): Console methods to track (`['error', 'warn', 'log']`, default: `['error']`).
- `throwOnWarning` (boolean): Treat warnings as critical (default: `false`).
- `whitelist` (array): Strings or RegExp to ignore (default: `[]`).
- `debug` (boolean): Enable debug logging for detailed output (default: `false`).

## Example Test

```javascript
describe('Test with Console Spy', () => {
    it('Checks console errors', () => {
        cy.visit('https://example.com');
        cy.window().then((win) => {
            win.console.error('Test error');
            win.console.warn('Test warning');
        });
        cy.task('getErrorStats').then((stats) => {
            console.log('Stats:', stats);
        });
    });
});
```

## Tasks

- `logConsoleError`: Logs console issues to the terminal.
- `saveConsoleErrorToFile`: Saves issues to `[testName].log` in `cypress/logs/`.
- `notifyCriticalError`: Sends notifications for critical errors.
- `getErrorStats`: Returns error and warning statistics.
- `resetErrorStats`: Resets statistics.
- `setDebugMode`: Toggles debug logging.

## License

MIT