# @mknrt/cypress-console-spy

A Cypress plugin to monitor and handle console errors, warnings, and uncaught errors during tests. It offers configurable options, whitelisting, error statistics, and logging capabilities, with robust support for test-specific and suite-level configuration overrides.

## Table of Contents

- [Installation](#installation)
- [Setup](#setup)
- [Core Files](#core-files)
- [Configuration](#configuration)
    - [Suite and Test-Specific Configuration](#suite-and-test-specific-configuration)
- [Features](#features)
- [Example Test](#example-test)
- [Debug Logging](#debug-logging)
- [Tasks](#tasks)
- [Changelog](#changelog)
- [Contributing](#contributing)
- [Issues](#issues)
- [License](#license)

## Installation

Install the plugin via npm:

```bash
npm install @mknrt/cypress-console-spy
```

## Older versions (<1.1.0) are deprecated; please update to the latest version.

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
                failOnSpy: true,
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

The plugin consists of two main files:

- **server.js**: Manages server-side tasks, including logging console issues, saving them to files, sending notifications, and tracking error statistics. It defines Cypress tasks like `logConsoleError`, `saveConsoleErrorToFile`, `notifyCriticalError`, `getErrorStats`, `resetErrorStats`, and `setDebugMode`. It also handles events like `before:run` (to reset stats) and `after:run` (to display a summary of errors and warnings).
- **client.js**: Handles client-side functionality by overriding Cypress's `describe`, `it`, `it.only`, and `it.skip` functions to wrap tests and suites. It sets up spies for specified console methods (e.g., `error`, `warn`), captures uncaught errors via a global error handler, filters issues based on a whitelist, checks for console issues after each test, and triggers server-side tasks for logging and notifications.

## Configuration

The plugin supports the following options, configurable via `Cypress.env('consoleDaemon')`:

- `failOnSpy` (boolean): Fails the test if console issues are detected (default: `true`). Can be overridden at the suite level with `describe('name', { consoleDaemon: { failOnSpy: false } }, () => {...})` or test level with `it('name', { consoleDaemon: { failOnSpy: false } }, () => {...})`.
- `logToFile` (boolean): Saves console issues to `[testName].log` in the `cypress/logs/` directory (default: `true`).
- `methodsToTrack` (array): Console methods to monitor (e.g., `['error', 'warn', 'log']`, default: `['error']`).
- `throwOnWarning` (boolean): Treats warnings as critical, failing the test if `failOnSpy` is `true` (default: `false`).
- `whitelist` (array): Strings or RegExp patterns to ignore when checking console issues (default: `[]`).
- `debug` (boolean): Enables detailed debug logging in the browser console (default: `false`).

### Suite and Test-Specific Configuration

You can override `failOnSpy` for entire test suites or individual tests using the `consoleDaemon` object:

```javascript
describe('Suite with ignored console errors', { consoleDaemon: { failOnSpy: false } }, () => {
    it('Test ignoring console errors', { consoleDaemon: { failOnSpy: false } }, () => {
        cy.visit('https://example.com');
        cy.window().then((win) => {
            win.console.error('Test error'); // Won't fail the test
        });
    });
});
```

## Features

- **Console Monitoring**: Tracks specified console methods (e.g., `error`, `warn`) during tests.
- **Uncaught Error Handling**: Captures uncaught errors (e.g., `Uncaught Error: ...`) and processes them with logging and notification tasks.
- **Whitelisting**: Ignores console messages matching specified strings or patterns.
- **Error Statistics**: Collects and summarizes errors and warnings across test runs.
- **Logging**: Saves issues to files in `cypress/logs/` (created automatically if the directory doesn't exist).
- **Suite and Test Overrides**: Supports `failOnSpy` overrides at both `describe` and `it` levels for flexible configuration.

## Example Test

Here’s an example demonstrating console monitoring, whitelisting, and debug mode:

```javascript
describe('Test Suite with Console Spy', { consoleDaemon: { failOnSpy: false } }, () => {
    it.only('Проверить чекбокс "Атрибут является хранимым"', { tags: ['@constructor', '@arm', '@arm-forms', '@regress'], consoleDaemon: { failOnSpy: false } }, () => {
        // Enable debug mode for this test
        cy.task('setDebugMode', true);

        cy.visit('https://example.com');
        cy.window().then((win) => {
            win.console.error('Test error'); // Won't fail due to consoleDaemon: { failOnSpy: false }
            win.console.warn('known warning'); // Ignored due to whitelist
            throw new Error('Uncaught test error'); // Captured and logged
        });

        // Check error statistics
        cy.task('getErrorStats').then((stats) => {
            console.log('Error Stats:', stats);
        });
    });
});
```

**[Expected Behavior]**:
- `Test error` is logged but doesn’t fail the test.
- `known warning` is ignored due to the whitelist.
- `Uncaught test error` is captured, logged, and saved to a file (if `logToFile: true`).
- Debug logs appear in the browser console if `debug: true`.

## Debug Logging

To troubleshoot issues, set `debug: true` in the plugin configuration or via `cy.task('setDebugMode', true)`. Debug logs will appear in the browser console, including:

- Configuration merging details (e.g., `Merged config: { default, describe, test, result }`).
- Spy creation and collection (e.g., `Spy created for console.error`, `Collected 1 calls for error`).
- Error checking and filtering (e.g., `All collected issues: [...]`, `Filtered issues: [...]`).
- Failure evaluation (e.g., `Evaluating failure: filteredIssues.length=1, failOnSpy=false`).

**Example Debug Log**:
```
Overriding describe with config: { consoleDaemon: { failOnSpy: false } }
Overriding it.only with config: { consoleDaemon: { failOnSpy: false } }
Merged config: { default: { failOnSpy: true, ... }, describe: { failOnSpy: false }, test: { failOnSpy: false }, result: { failOnSpy: false, ... } }
Spy created for console.error
Collected 1 calls for error
All collected issues: [{ type: "error", message: ["TEST ERROR"] }]
Filtered issues: [["TEST ERROR"]]
Evaluating failure: filteredIssues.length=1, failOnSpy=false
No failure thrown due to failOnSpy=false or no issues
```

Logs are saved to `cypress/logs/[testName].log` if `logToFile: true`.

## Tasks

The plugin provides the following Cypress tasks:

- `logConsoleError`: Logs console issues to the terminal.
- `saveConsoleErrorToFile`: Saves issues to `[testName].log` in `cypress/logs/`.
- `notifyCriticalError`: Logs critical error notifications to the terminal.
- `getErrorStats`: Returns error and warning statistics.
- `resetErrorStats`: Resets statistics.
- `setDebugMode`: Toggles debug logging.

## Changelog


### [Latest Version = 1.2.1]
- **Simplified Config Format**: Configuration now uses ONLY the `consoleDaemon` key for consistency. Use `{ consoleDaemon: { failOnSpy: false } }` format in `describe` and `it` blocks.

### [1.2.0]
- **TypeScript Support**: Added full TypeScript type definitions (`index.d.ts`) for better IDE support and type safety.
- **Performance Optimization**: Replaced multiple `cy.task` calls with a single batch call (`processConsoleBatch`), significantly improving performance when multiple errors are detected.
- **Async File Operations**: Replaced synchronous file writes with asynchronous operations in server.js to prevent blocking the Node.js event loop.
- **Fixed Multiple Error Listeners**: Added `WeakSet` tracking to prevent duplicate error event listeners on window objects during page navigation.
- **Improved Message Handling**: Added `messageToString` utility function to safely convert any message type (arrays, objects, primitives) to strings, preventing `.join()` errors.
- **Better Type Detection**: Improved `collectSpyCalls` to correctly categorize `error`, `warn`, and `info` console methods instead of treating all non-errors as warnings.
- **Removed Hardcoded Path**: Removed the hardcoded `sample.cy.js` path check from `processIssues`.
- **Configurable Log Directory**: Added support for custom log directory via `config.env.consoleDaemon.logDir`.
- **Optimized Directory Creation**: Log directory is now created once during `before:run` instead of checking on every file write.
- **Improved Debug Logging**: Added consistent `[cypress-console-spy]` prefix to all debug and error messages.
- **Backward Compatibility**: Legacy task functions (`logConsoleError`, `saveConsoleErrorToFile`, `notifyCriticalError`) are preserved for backward compatibility.

### [1.1.4]
- **CRITICAL BUG FIX**: Fixed issue where tests were not failing when console errors were detected. The promise chain in `wrapTest` was incorrectly structured, causing errors thrown by `checkConsoleErrors` to not propagate properly.
- Improved spy data collection: Now explicitly collects spy calls before checking errors in `wrapTest`, ensuring all console errors are captured.
- Fixed `setupConsoleSpy` to collect data from existing spies before cleaning them up, preventing data loss during page navigation.
- Added try-catch blocks around spy operations to prevent crashes when spies fail to restore or create.
- Removed redundant spy collection call from `checkConsoleErrors` (now handled in `wrapTest`).

### [1.1.3]
- Updated `setupConsoleSpy` in `client.js`: Removed direct `cy.task` calls from the `window.onerror` handler. Errors are now only added to the `allIssues` array for later processing, ensuring compatibility with Cypress command chain.
- Maintained error handling in `checkConsoleErrors`: Ensured that `checkConsoleErrors` correctly processes all errors, including `ResizeObserver` errors, via the `processIssues` function, preserving existing functionality.

### [1.1.2] 
- Updated readme.md

### [1.1.1] 
- Fixed issue with whitelist being overwritten by test or suite configurations, ensuring global whitelist from customConfig is preserved unless explicitly overridden in describe, or it blocks.
- Improved configuration merging in client.js to handle consoleDaemon properties specifically, preventing loss of whitelist and debug settings.
- Enhanced debug logging to include customConfig details for better troubleshooting.
- Updated `failOnSpy` configuration to use `consoleDaemon: { failOnSpy: false }` for test and suite overrides.

### [1.1.0]
- Fixed `failOnSpy: false` not being respected in `it.only` tests.
- Added support for `describe` block configuration overrides.
- Eliminated duplicate `checkConsoleErrors` calls for consistent behavior.
- Simplified configuration merging in `client.js`.
- Updated `readme.md` with new features, debug logging details, and clearer examples.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/iamknrt/cypress-console-spy).

## Issues

Report problems or suggest improvements on the [GitHub issues page](https://github.com/iamknrt/cypress-console-spy/issues).

## License

MIT