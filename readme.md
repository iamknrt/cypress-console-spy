# @mknrt/cypress-console-spy

Cypress plugin for tracking browser console output, uncaught browser errors, file logging, and aggregated run statistics.

## Installation

```bash
npm install @mknrt/cypress-console-spy
```

## Setup

Register the server side in `cypress.config.js`:

```javascript
const { defineConfig } = require('cypress');
const { server } = require('@mknrt/cypress-console-spy');

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      server(on, config);
      return config;
    },
    expose: {
      consoleDaemon: {
        failOnSpy: true,
        logToFile: true,
        logDir: 'cypress/logs',
        methodsToTrack: ['error', 'warn'],
        throwOnWarning: false,
        whitelist: ['socket.io', /ResizeObserver/],
        debug: false,
      },
    },
  },
});
```

Register the client side in `cypress/support/e2e.js`:

```javascript
const { client } = require('@mknrt/cypress-console-spy');

client(Cypress, Cypress.expose('consoleDaemon'));
```

If your project still stores plugin config in `env.consoleDaemon`, that object can still be passed to `client()`. The plugin itself only consumes the config object you provide.

## Configuration

`consoleDaemon` supports:

- `failOnSpy`: fail the test when non-whitelisted console issues are found
- `logToFile`: write filtered issues to a spec-specific log file
- `logDir`: custom server-side log directory
- `methodsToTrack`: any subset of `['error', 'warn', 'log', 'info', 'debug']`
- `throwOnWarning`: make `console.warn` fail the test too
- `whitelist`: strings or regular expressions ignored during filtering
- `debug`: print plugin internals to the browser console

## Suite And Test Overrides

Overrides must be nested under `consoleDaemon`.

```javascript
describe(
  'suite override',
  {
    viewportWidth: 900,
    consoleDaemon: {
      failOnSpy: false,
      whitelist: ['known noisy error'],
    },
  },
  () => {
    it(
      'test override',
      {
        consoleDaemon: {
          methodsToTrack: ['warn', 'info'],
          logToFile: false,
        },
      },
      () => {
        cy.window().then((win) => {
          win.console.warn('tracked warning');
          win.console.info('tracked info');
        });
      },
    );
  },
);
```

Nested `describe`, `describe.only`, and `it.only` keep the same `consoleDaemon` semantics as plain `describe` / `it`.

## Behavior

- `error`, `warn`, `log`, `info`, and `debug` can all be tracked.
- After whitelist filtering, all tracked issues are sent to server-side statistics and optional file logs.
- Test failure is controlled separately:
  - `console.error` fails when `failOnSpy` is `true`
  - `console.warn` fails only when both `failOnSpy` and `throwOnWarning` are `true`
  - `log`, `info`, and `debug` never fail the test by themselves
- Uncaught browser `error` events are captured as `error` issues.

## Statistics

`cy.task('getErrorStats')` returns:

```js
{
  errors: 0,
  warnings: 0,
  info: 0,
  details: [
    { type: 'error', message: '...' },
    { type: 'warn', message: '...' },
    { type: 'info', message: '...' },
  ],
}
```

Use `cy.task('resetErrorStats')` to reset counters between scenarios.

## Logging

- Log directories are created automatically.
- Log file names are derived from the full relative spec path, not only the basename.
- `logToFile: false` can be overridden at suite or test level.

## Legacy Tasks

The plugin still exposes these legacy tasks for backward compatibility:

- `logConsoleError`
- `saveConsoleErrorToFile`
- `notifyCriticalError`
- `getErrorStats`
- `resetErrorStats`
- `setDebugMode`

## License

MIT
