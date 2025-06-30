const defaultConfig = {
    failOnSpy: true,
    logToFile: true,
    methodsToTrack: ['error'],
    throwOnWarning: false,
    whitelist: [],
    debug: false,
};

module.exports = (Cypress, customConfig = {}) => {
    const config = { ...defaultConfig, ...customConfig };
    const consoleSpies = {};
    const allIssues = [];
    let currentTestConfig = {};
    let describeConfig = {};

    // Utility to log debug messages if debug mode is enabled
    const debugLog = (...args) => {
        if (config.debug) console.log(...args);
    };

    // Merges configurations from describe and test levels
    const getMergedConfig = (testConfig) => {
        // Ensure consoleDaemon-specific properties are preserved
        const merged = {
            ...defaultConfig,
            ...config, // Include global customConfig
            ...describeConfig.consoleDaemon,
            ...testConfig.consoleDaemon,
            // Explicitly preserve whitelist unless overridden
            whitelist:
                (testConfig.consoleDaemon?.whitelist ||
                    describeConfig.consoleDaemon?.whitelist ||
                    config.whitelist ||
                    defaultConfig.whitelist),
            debug:
                testConfig.consoleDaemon?.debug ??
                describeConfig.consoleDaemon?.debug ??
                config.debug ??
                defaultConfig.debug,
        };
        debugLog('Merged config:', {
            default: defaultConfig,
            custom: config,
            describe: describeConfig,
            test: testConfig,
            result: merged,
        });
        return merged;
    };

    // Collects calls from a spy and adds them to allIssues
    const collectSpyCalls = (method, spy) => {
        if (!spy?.getCalls) return;
        const calls = spy.getCalls().map((call) => ({
            method,
            args: call.args,
        }));
        allIssues.push(...calls.map((call) => ({
            type: method === 'error' ? 'error' : 'warn',
            message: call.args,
        })));
        debugLog(`Collected ${calls.length} calls for ${method}`);
    };

    // Sets up console spies and error handlers for a given window
    const setupConsoleSpy = (win) => {
        // Clean up existing spies
        Object.values(consoleSpies).forEach((spy) => {
            if (spy?.restore) {
                config.methodsToTrack.forEach((method) => collectSpyCalls(method, spy));
                spy.restore();
                debugLog('Spy restored in setupConsoleSpy');
            }
        });
        Object.keys(consoleSpies).forEach((key) => delete consoleSpies[key]);

        // Create new spies
        config.methodsToTrack.forEach((method) => {
            if (win.console[method] && !win.console[method].__cy_spy && !consoleSpies[method]) {
                consoleSpies[method] = cy.spy(win.console, method);
                debugLog(`Spy created for console.${method}`);
            }
        });

        // Add global error handler
        win.addEventListener('error', (event) => {
            const errorMessage = `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}`;
            const rawMessage = event.message; // Store raw error message for whitelist
            allIssues.push({
                type: 'error',
                message: [errorMessage],
                rawMessage, // Add raw message for whitelist filtering
            });
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
    };

    // Processes and logs issues (errors/warnings)
    const processIssues = (issues) => {
        const logPromises = issues.map((issue) => {
            const type = issue.type;
            const message = issue.message;
            return cy.task('logConsoleError', { message, type }, { log: false }).then(() => {
                if (config.logToFile) {
                    const testPath = Cypress.spec.relative.includes('sample.cy.js')
                        ? 'cypress/e2e/tests/sample.cy.js'
                        : Cypress.spec.relative;
                    debugLog('Cypress.spec:', Cypress.spec);
                    debugLog('Calling saveConsoleErrorToFile with:', { message, type, testPath });
                    return cy.task(
                        'saveConsoleErrorToFile',
                        { message, type, testPath },
                        { log: false }
                    );
                }
            }).then(() => {
                if (type === 'error') {
                    return cy.task('notifyCriticalError', { message, type }, { log: false });
                }
            });
        });
        return cy.wrap(Promise.all(logPromises), { log: false });
    };

    // Checks console for errors and warnings, failing the test if needed
    const checkConsoleErrors = () => {
        const mergedConfig = getMergedConfig(currentTestConfig);
        debugLog('Checking console errors with merged config:', mergedConfig);
        // Collect remaining calls from current spies
        config.methodsToTrack.forEach((method) => collectSpyCalls(method, consoleSpies[method]));
        debugLog('All collected issues:', allIssues);

        // Filter errors and warnings
        const errors = allIssues.filter((issue) => issue.type === 'error').map((issue) => issue);
        const warnings = allIssues.filter((issue) => issue.type === 'warn').map((issue) => issue);

        // Filter out whitelisted messages
        const filteredIssues = [...errors, ...(mergedConfig.throwOnWarning ? warnings : [])].filter(
            (issue) => {
                const message = issue.rawMessage || issue.message.join(' ');
                return !mergedConfig.whitelist.some((pattern) =>
                    typeof pattern === 'string' ? message.includes(pattern) : pattern.test(message)
                );
            }
        );
        debugLog('Filtered issues:', filteredIssues);

        // Process logging tasks
        return processIssues(filteredIssues.map((issue) => ({
            type: issue.type,
            message: issue.message,
        }))).then(() => {
            debugLog(`Evaluating failure: filteredIssues.length=${filteredIssues.length}, failOnSpy=${mergedConfig.failOnSpy}`);
            if (filteredIssues.length > 0 && mergedConfig.failOnSpy) {
                const errorMessage =
                    `Console errors detected (${filteredIssues.length}):\n` +
                    filteredIssues.map((issue) => `• ${issue.message.join(' ')}`).join('\n');
                const consoleError = new Error(errorMessage);
                consoleError.name = 'ConsoleErrors';

                Cypress.log({
                    name: 'Console Errors',
                    message: errorMessage,
                    consoleProps: () => ({
                        'Detected Errors': filteredIssues.map((issue) => issue.message.join(' ')),
                        Recommendations: 'Check the browser console output',
                    }),
                });

                throw consoleError;
            }
            debugLog('No failure thrown due to failOnSpy=false or no issues');
        });
    };

    // Cleans up spies and clears consoleSpies
    const cleanupSpies = () => {
        Object.values(consoleSpies).forEach((spy) => {
            if (spy?.restore) {
                spy.restore();
                debugLog('Spy restored after test');
            }
        });
        Object.keys(consoleSpies).forEach((key) => delete consoleSpies[key]);
    };

    // Wraps a test function to include console spying and error checking
    const wrapTest = (testFn, testConfig) => {
        return function () {
            debugLog('Wrapping test with config:', testConfig);
            currentTestConfig = testConfig;
            cleanupSpies();
            allIssues.length = 0; // Reset issues at test start

            return cy.window().then((win) => {
                setupConsoleSpy(win);
                return testFn.call(this);
            }).then(() => cy.then(() => checkConsoleErrors()))
                .then(cleanupSpies);
        };
    };

    // Override global `describe` to capture config
    const originalDescribe = global.describe;
    global.describe = function (name, configOrFn, fn) {
        const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
        const describeFn = isConfigObject ? fn : configOrFn;
        const describeConfigObj = isConfigObject ? configOrFn : {};

        debugLog(`Overriding describe with config:`, describeConfigObj);
        describeConfig = describeConfigObj; // Store describe config

        return originalDescribe.call(this, name, describeFn);
    };
    global.describe.only = originalDescribe.only;
    global.describe.skip = originalDescribe.skip;

    // Override global `it` and `it.only`
    const overrideIt = (originalIt, isOnly = false) => {
        return function (description, configOrFn, fn) {
            const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
            const testFn = isConfigObject ? fn : configOrFn;
            const testConfig = isConfigObject ? configOrFn : {};

            debugLog(`Overriding ${isOnly ? 'it.only' : 'it'} with config:`, testConfig);

            if (!testFn || typeof testFn !== 'function') {
                debugLog('cypress-console-spy: testFn is not a function, skipping wrap:', testFn);
                return isConfigObject
                    ? originalIt.call(this, description, configOrFn, testFn)
                    : originalIt.call(this, description, testFn);
            }

            return isConfigObject
                ? originalIt.call(this, description, configOrFn, wrapTest(testFn, testConfig))
                : originalIt.call(this, description, wrapTest(testFn, testConfig));
        };
    };

    // Apply overrides
    const originalIt = global.it;
    global.it = overrideIt(originalIt);
    global.it.only = overrideIt(originalIt.only, true);
    global.it.skip = function (description, configOrFn, fn) {
        const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
        const testFn = isConfigObject ? fn : configOrFn;
        return isConfigObject
            ? originalIt.skip.call(this, description, configOrFn, testFn)
            : originalIt.skip.call(this, description, testFn);
    };

    // Set up spies on window load
    Cypress.on('window:load', (win) => {
        debugLog('window:load event triggered, setting up console spies');
        setupConsoleSpy(win);
    });
};