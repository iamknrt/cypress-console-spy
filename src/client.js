const defaultConfig = {
    stopOnError: true,
    logToFile: true,
    methodsToTrack: ['error'],
    throwOnWarning: false,
    whitelist: [],
    debug: false,
};

module.exports = (Cypress, customConfig = {}) => {
    const config = { ...defaultConfig, ...customConfig };
    const consoleSpies = {};

    function debugLog(...args) {
        if (config.debug) {
            console.log(...args);
        }
    }

    // Checks console for errors and warnings based on configuration
    const checkConsoleErrors = () => {
        const errors = [];
        const warnings = [];

        debugLog('Checking console spies:', Object.keys(consoleSpies));
        config.methodsToTrack.forEach((method) => {
            const spy = consoleSpies[method];
            if (spy?.getCalls) {
                const calls = spy.getCalls().map((call) => call.args);
                debugLog(`Spy calls for ${method}:`, calls);
                if (method === 'error') {
                    errors.push(...calls);
                } else if (method === 'warn' && config.throwOnWarning) {
                    warnings.push(...calls);
                }
            }
        });

        // Filter out whitelisted messages
        const filteredIssues = [...errors, ...(config.throwOnWarning ? warnings : [])].filter(
            (issue) => {
                const message = issue.join(' ');
                return !config.whitelist.some((pattern) =>
                    typeof pattern === 'string'
                        ? message.includes(pattern)
                        : pattern.test(message)
                );
            }
        );

        debugLog('Filtered issues:', filteredIssues);

        // Process all logging tasks first
        const logPromises = filteredIssues.map((issue) => {
            const type = errors.includes(issue) ? 'error' : 'warn';
            return cy.task('logConsoleError', { message: issue, type }, { log: false }).then(() => {
                if (config.logToFile) {
                    debugLog('Cypress.spec:', Cypress.spec);
                    // Handle incorrect path for sample test
                    const testPath = Cypress.spec.relative.includes('sample.cy.js')
                        ? 'cypress/e2e/tests/sample.cy.js'
                        : Cypress.spec.relative;
                    debugLog('Calling saveConsoleErrorToFile with:', { message: issue, type, testPath });
                    return cy.task(
                        'saveConsoleErrorToFile',
                        { message: issue, type, testPath },
                        { log: false }
                    );
                }
                return null;
            }).then(() => {
                if (type === 'error') {
                    return cy.task('notifyCriticalError', { message: issue, type }, { log: false });
                }
                return null;
            });
        });

        // Wait for all logging tasks to complete
        return cy.wrap(Promise.all(logPromises), { log: false }).then(() => {
            if (filteredIssues.length > 0 && config.stopOnError) {
                const errorMessage =
                    `Console errors detected (${filteredIssues.length}):\n` +
                    filteredIssues.map((issue) => `• ${issue.join(' ')}`).join('\n');

                const consoleError = new Error(errorMessage);
                consoleError.name = 'ConsoleErrors';

                Cypress.log({
                    name: 'Console Errors',
                    message: errorMessage,
                    consoleProps: () => ({
                        'Detected Errors': filteredIssues.map((issue) => issue.join(' ')),
                        Recommendations: 'Check the browser console output',
                    }),
                });

                throw consoleError;
            }
        });
    };

    // Override global `it` function to add console error checking
    const originalIt = global.it;
    global.it = function (description, configOrFn, fn) {
        // Проверяем, является ли configOrFn объектом конфигурации
        const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
        const testFn = isConfigObject ? fn : configOrFn;

        // Если testFn отсутствует или не функция, вызываем оригинальный it
        if (!testFn || typeof testFn !== 'function') {
            debugLog('cypress-console-spy: testFn is not a function, skipping wrap:', testFn);
            return isConfigObject
                ? originalIt.call(this, description, configOrFn, testFn)
                : originalIt.call(this, description, testFn);
        }

        const wrappedTest = function () {
            // Reset spies before each test
            Object.values(consoleSpies).forEach((spy) => spy?.resetHistory());

            return cy.window().then((win) => {
                // Set up console spies
                config.methodsToTrack.forEach((method) => {
                    if (win.console[method]) {
                        consoleSpies[method] = cy.spy(win.console, method);
                        debugLog(`Spy created for console.${method}`);
                    }
                });

                // Handle global uncaught errors
                win.addEventListener('error', (event) => {
                    const errorMessage = `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}`;
                    cy.task('logConsoleError', { message: [errorMessage], type: 'error' }, { log: false });
                    if (config.logToFile) {
                        cy.task(
                            'saveConsoleErrorToFile',
                            { message: [errorMessage], type: 'error', testPath: Cypress.spec.relative },
                            { log: false }
                        );
                    }
                    cy.task('notifyCriticalError', { message: [errorMessage], type: 'error' }, { log: false });
                });

                // Execute the test function
                return testFn.call(this);
            }).then(() => {
                // Check for console errors after test execution
                return cy.then(checkConsoleErrors);
            });
        };

        return isConfigObject
            ? originalIt.call(this, description, configOrFn, wrappedTest)
            : originalIt.call(this, description, wrappedTest);
    };

    // Handle special cases: it.only
    global.it.only = function (description, configOrFn, fn) {
        const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
        const testFn = isConfigObject ? fn : configOrFn;

        if (!testFn || typeof testFn !== 'function') {
            debugLog('cypress-console-spy: testFn is not a function, skipping wrap:', testFn);
            return isConfigObject
                ? originalIt.only.call(this, description, configOrFn, testFn)
                : originalIt.only.call(this, description, testFn);
        }

        const wrappedTest = function () {
            Object.values(consoleSpies).forEach((spy) => spy?.resetHistory());
            return cy.window().then((win) => {
                config.methodsToTrack.forEach((method) => {
                    if (win.console[method]) {
                        consoleSpies[method] = cy.spy(win.console, method);
                        debugLog(`Spy created for console.${method}`);
                    }
                });

                win.addEventListener('error', (event) => {
                    const errorMessage = `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}`;
                    cy.task('logConsoleError', { message: [errorMessage], type: 'error' }, { log: false });
                    if (config.logToFile) {
                        cy.task(
                            'saveConsoleErrorToFile',
                            { message: [errorMessage], type: 'error', testPath: Cypress.spec.relative },
                            { log: false }
                        );
                    }
                    cy.task('notifyCriticalError', { message: [errorMessage], type: 'error' }, { log: false });
                });

                return testFn.call(this);
            }).then(() => {
                return cy.then(checkConsoleErrors);
            });
        };

        return isConfigObject
            ? originalIt.only.call(this, description, configOrFn, wrappedTest)
            : originalIt.only.call(this, description, wrappedTest);
    };

    // Handle special cases: it.skip
    global.it.skip = function (description, configOrFn, fn) {
        const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
        const testFn = isConfigObject ? fn : configOrFn;

        return isConfigObject
            ? originalIt.skip.call(this, description, configOrFn, testFn)
            : originalIt.skip.call(this, description, testFn);
    };
};