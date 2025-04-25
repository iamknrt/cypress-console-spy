# @mknrt/cypress-console-spy

A Cypress plugin to monitor and handle console errors, warnings, and uncaught errors during tests. It provides configurable options, whitelisting, error statistics, and logging capabilities.

## Installation

Install the plugin via npm:

```bash
npm install @mknrt/cypress-console-spy
```

**Older versions (`1.0.0` and `1.0.1`) are deprecated; please update to the latest version.

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
                debug: false,
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

- **server.js**: Handles server-side tasks such as logging console issues, saving them to files, sending notifications, and maintaining error statistics. It defines Cypress tasks like `logConsoleError`, `saveConsoleErrorToFile`, `notifyCriticalError`, `getErrorStats`, `resetErrorStats`, and `setDebugMode`. It also manages events like `before:run` (to reset stats) and `after:run` (to display a summary of errors and warnings).
- **client.js**: Manages client-side functionality by overriding Cypress's `it`, `it.only`, and `it.skip` functions to wrap tests. It sets up spies for specified console methods (e.g., `error`, `warn`), captures uncaught errors via a global error handler, filters issues based on a whitelist, checks for console issues after each test, and triggers server-side tasks for logging and notifications.

## Configuration

The plugin supports the following options (via `Cypress.env('consoleDaemon')`):

- `stopOnError` (boolean): Stop the test if console issues are detected (default: `true`).
- `logToFile` (boolean): Save console issues (including uncaught errors) to `[testName].log` in the `cypress/logs/` directory (default: `true`).
- `methodsToTrack` (array): Console methods to track (e.g., `['error', 'warn', 'log']`, default: `['error']`).
- `throwOnWarning` (boolean): Treat warnings as critical, stopping the test if `stopOnError` is `true` (default: `false`).
- `whitelist` (array): Strings or RegExp patterns to ignore when checking console issues (default: `[]`).
- `debug` (boolean): Enable debug logging for detailed output (default: `false`).

## Features

- **Console Monitoring**: Tracks specified console methods (e.g., `error`, `warn`) during tests.
- **Uncaught Error Handling**: Automatically captures uncaught errors (e.g., `Uncaught Error: ...`) and processes them using the same logging and notification tasks.
- **Whitelisting**: Ignores console messages matching specified strings or patterns.
- **Error Statistics**: Collects and summarizes errors and warnings across test runs.
- **Logging**: Saves issues to files in `cypress/logs/` (created automatically if the directory doesn't exist).

## Example Test

Here’s an example test that demonstrates console monitoring, whitelisting, and debug mode:

```javascript
describe('Test with Console Spy', () => {
it('Checks console errors and warnings', () => {
// Enable debug mode for this test
cy.task('setDebugMode', true);

        cy.visit('https://example.com');
        cy.window().then((win) => {
            // This error will be caught and stop the test (if stopOnError is true)
            win.console.error('Test error');

            // This warning will be ignored due to the whitelist
            win.console.warn('known warning');

            // This will trigger an uncaught error
            throw new Error('Uncaught test error');
        });

        // Check error statistics
        cy.task('getErrorStats').then((stats) => {
            console.log('Error Stats:', stats);
        });
    });
});
```

**Expected Behavior**:
- The `Test error` will be logged and stop the test (if `stopOnError` is `true`).
- The `known warning` will be ignored due to the whitelist.
- The uncaught error (`Uncaught test error`) will be captured, logged, and saved to a file (if `logToFile` is `true`).
- Debug logs will be visible in the terminal if `debug` is `true`.

## Tasks

The plugin provides the following Cypress tasks:

- `logConsoleError`: Logs console issues (errors, warnings) to the terminal.
- `saveConsoleErrorToFile`: Saves issues to `[testName].log` in `cypress/logs/` (creates the directory if it doesn't exist).
- `notifyCriticalError`: Logs critical error notifications to the terminal (used for errors and uncaught errors).
- `getErrorStats`: Returns error and warning statistics.
- `resetErrorStats`: Resets statistics.
- `setDebugMode`: Toggles debug logging.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/iamknrt/cypress-console-spy).

## Issues

If you encounter any problems or have suggestions, please file an issue on the [GitHub repository](https://github.com/iamknrt/cypress-console-spy/issues).

## License

MIT
