# Changelog

## 1.2.6

- Fixed suite-level and test-level `consoleDaemon` override handling for `describe`, `describe.only`, `describe.skip`, `it`, and `it.only`
- Fixed runtime config merging for `failOnSpy`, `methodsToTrack`, `throwOnWarning`, `logToFile`, `debug`, and inherited whitelists
- Fixed server-side stats aggregation for `error`, `warn`, `log`, `info`, and `debug`
- Fixed log file naming to avoid spec path collisions
- Added `cy.fatal(...)` reporting when console issues are detected
- Updated TypeScript declarations and README to match the actual plugin API
