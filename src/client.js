const defaultConfig = {
    failOnSpy: true,
    logToFile: true,
    methodsToTrack: ['error'],
    throwOnWarning: false,
    whitelist: [],
    debug: false,
};

/**
 * Safely converts message to string
 * Handles Error objects, arrays, and other types properly
 * @param {*} message - Message to convert (can be array, string, object, Error, etc.)
 * @returns {string} - String representation of the message
 */
const messageToString = (message) => {
    if (message === null) {
        return 'null';
    }
    if (message === undefined) {
        return 'undefined';
    }
    // Handle Error objects specially - JSON.stringify returns {} for Error
    if (message instanceof Error) {
        // Include name, message, and optionally stack
        const errorParts = [];
        if (message.name && message.name !== 'Error') {
            errorParts.push(message.name + ':');
        }
        if (message.message) {
            errorParts.push(message.message);
        }
        return errorParts.length > 0 ? errorParts.join(' ') : String(message);
    }
    // Handle arrays - recursively convert each item
    if (Array.isArray(message)) {
        return message.map((item) => messageToString(item)).join(' ');
    }
    // Handle objects
    if (typeof message === 'object') {
        // Check if object has a message property (common for error-like objects)
        if (message.message && typeof message.message === 'string') {
            const prefix = message.name ? `${message.name}: ` : '';
            return prefix + message.message;
        }
        // Try to stringify, but handle circular references
        try {
            const str = JSON.stringify(message);
            // If it's just an empty object, try toString
            if (str === '{}' || str === '[]') {
                const toStr = String(message);
                // If toString gives something useful, use it
                if (toStr !== '[object Object]' && toStr !== '') {
                    return toStr;
                }
            }
            return str;
        } catch {
            return String(message);
        }
    }
    return String(message);
};

module.exports = (Cypress, customConfig = {}) => {
    const config = { ...defaultConfig, ...customConfig };
    const consoleSpies = {};
    const allIssues = [];
    let currentTestConfig = {};
    // Track current describe config per test context (using WeakMap for garbage collection)
    const describeConfigForTests = new WeakMap();
    // Track windows with attached error handlers to prevent duplicates
    const windowsWithErrorHandlers = new WeakSet();

    // Utility to log debug messages if debug mode is enabled
    const debugLog = (...args) => {
        if (config.debug) console.log(...args);
    };

    // Merges configurations from describe and test levels
    // ONLY reads from consoleDaemon key: { consoleDaemon: { failOnSpy: false } }
    const getMergedConfig = (testConfig, describeConfigForTest = {}) => {
        const describeConsoleDaemon = describeConfigForTest?.consoleDaemon || {};
        const testConsoleDaemon = testConfig?.consoleDaemon || {};

        // Merge whitelists from all levels (not override)
        // This allows adding to the global whitelist at describe/test level
        const mergedWhitelist = [
            ...(config.whitelist || []),
            ...(describeConsoleDaemon.whitelist || []),
            ...(testConsoleDaemon.whitelist || []),
        ];

        const merged = {
            ...defaultConfig,
            ...config, // Global customConfig from Cypress.env('consoleDaemon')
            ...describeConsoleDaemon,
            ...testConsoleDaemon,
            // Whitelist is merged from all levels, not overridden
            whitelist: mergedWhitelist,
            debug:
                testConsoleDaemon.debug ??
                describeConsoleDaemon.debug ??
                config.debug ??
                defaultConfig.debug,
        };
        debugLog('Merged config:', {
            default: defaultConfig,
            custom: config,
            describe: describeConsoleDaemon,
            test: testConsoleDaemon,
            result: merged,
        });
        return merged;
    };

    // Determines the issue type based on console method
    const getIssueType = (method) => {
        if (method === 'error') return 'error';
        if (method === 'warn') return 'warn';
        return 'info';
    };

    // Collects calls from a spy and adds them to allIssues
    const collectSpyCalls = (method, spy) => {
        if (!spy?.getCalls) return;
        const calls = spy.getCalls();
        const newIssues = calls.map((call) => {
            // Extract raw message for whitelist matching
            // Try to get the most meaningful string representation
            const args = call.args;
            let rawMessage = '';
            
            // Build rawMessage from all arguments
            for (const arg of args) {
                if (arg instanceof Error) {
                    rawMessage += (arg.name ? arg.name + ': ' : '') + (arg.message || '') + ' ';
                } else if (typeof arg === 'string') {
                    rawMessage += arg + ' ';
                } else if (arg && typeof arg === 'object' && arg.message) {
                    rawMessage += (arg.name ? arg.name + ': ' : '') + arg.message + ' ';
                } else if (arg !== null && arg !== undefined) {
                    rawMessage += messageToString(arg) + ' ';
                }
            }
            
            return {
                type: getIssueType(method),
                message: args,
                rawMessage: rawMessage.trim(),
            };
        });
        allIssues.push(...newIssues);
        debugLog(`Collected ${calls.length} calls for ${method}`);
    };

    // Sets up console spies and error handlers for a given window
    const setupConsoleSpy = (win) => {
        // Collect data from existing spies before cleaning up
        config.methodsToTrack.forEach((method) => {
            if (consoleSpies[method]) {
                collectSpyCalls(method, consoleSpies[method]);
            }
        });

        // Clean up existing spies
        Object.values(consoleSpies).forEach((spy) => {
            if (spy?.restore) {
                try {
                    spy.restore();
                    debugLog('Spy restored in setupConsoleSpy');
                } catch (e) {
                    debugLog('Failed to restore spy:', e.message);
                }
            }
        });
        Object.keys(consoleSpies).forEach((key) => delete consoleSpies[key]);

        // Create new spies
        config.methodsToTrack.forEach((method) => {
            if (win.console && win.console[method] && !consoleSpies[method]) {
                try {
                    consoleSpies[method] = cy.spy(win.console, method);
                    debugLog(`Spy created for console.${method}`);
                } catch (e) {
                    debugLog(`Failed to create spy for console.${method}:`, e.message);
                }
            }
        });

        // Add global error handler only once per window
        if (!windowsWithErrorHandlers.has(win)) {
            windowsWithErrorHandlers.add(win);
            win.addEventListener('error', (event) => {
                const errorMessage = `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}`;
                const rawMessage = event.message;
                allIssues.push({
                    type: 'error',
                    message: [errorMessage],
                    rawMessage,
                });
                debugLog(`Captured uncaught error: ${errorMessage}`);
            });
            debugLog('Error handler attached to window');
        }
    };

    // Processes and logs issues (errors/warnings) in batch for better performance
    const processIssues = (issues) => {
        if (issues.length === 0) {
            return cy.wrap(null, { log: false });
        }

        const testPath = Cypress.spec.relative;
        debugLog('Cypress.spec:', Cypress.spec);
        debugLog('Processing issues batch:', issues);

        // Batch all issues into a single task call for better performance
        // Use rawMessage if available for better readability
        return cy.task('processConsoleBatch', {
            issues: issues.map((issue) => ({
                type: issue.type,
                message: issue.rawMessage || messageToString(issue.message),
            })),
            testPath,
            logToFile: config.logToFile,
        }, { log: false });
    };

    // Checks console for errors and warnings, failing the test if needed
    const checkConsoleErrors = (describeConfigForTest = {}) => {
        const mergedConfig = getMergedConfig(currentTestConfig, describeConfigForTest);
        debugLog('Checking console errors with merged config:', mergedConfig);
        debugLog('Whitelist patterns:', mergedConfig.whitelist);
        debugLog('All collected issues:', allIssues);

        // Filter errors and warnings
        const errors = allIssues.filter((issue) => issue.type === 'error');
        const warnings = allIssues.filter((issue) => issue.type === 'warn');

        // Filter out whitelisted messages
        const filteredIssues = [...errors, ...(mergedConfig.throwOnWarning ? warnings : [])].filter(
            (issue) => {
                // Use rawMessage if available (better for whitelist matching), otherwise convert
                const message = issue.rawMessage || messageToString(issue.message);
                debugLog(`Checking message against whitelist: "${message}"`);
                
                const isWhitelisted = mergedConfig.whitelist.some((pattern) => {
                    const matches = typeof pattern === 'string' 
                        ? message.includes(pattern) 
                        : pattern.test(message);
                    if (matches) {
                        debugLog(`Message matched whitelist pattern: ${pattern}`);
                    }
                    return matches;
                });
                
                return !isWhitelisted;
            }
        );
        debugLog('Filtered issues (after whitelist):', filteredIssues);

        // Process logging tasks
        return processIssues(filteredIssues).then(() => {
            debugLog(`Evaluating failure: filteredIssues.length=${filteredIssues.length}, failOnSpy=${mergedConfig.failOnSpy}`);
            if (filteredIssues.length > 0 && mergedConfig.failOnSpy) {
                // Use rawMessage for display if available
                const formatIssue = (issue) => issue.rawMessage || messageToString(issue.message);
                
                const errorMessage =
                    `Console errors detected (${filteredIssues.length}):\n` +
                    filteredIssues.map((issue) => `• ${formatIssue(issue)}`).join('\n');
                const consoleError = new Error(errorMessage);
                consoleError.name = 'ConsoleErrors';

                Cypress.log({
                    name: 'Console Errors',
                    message: errorMessage,
                    consoleProps: () => ({
                        'Detected Errors': filteredIssues.map((issue) => formatIssue(issue)),
                        'Whitelist': mergedConfig.whitelist,
                        Recommendations: 'Check the browser console output or add to whitelist',
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
    const wrapTest = (testFn, testConfig, describeConfigForTest = {}) => {
        return function () {
            debugLog('Wrapping test with config:', testConfig);
            debugLog('Describe config for this test:', describeConfigForTest);
            currentTestConfig = testConfig;
            cleanupSpies();
            allIssues.length = 0; // Reset issues at test start

            return cy.window().then((win) => {
                setupConsoleSpy(win);
                return testFn.call(this);
            }).then(() => {
                // Collect spy calls before checking errors
                config.methodsToTrack.forEach((method) => collectSpyCalls(method, consoleSpies[method]));
                return checkConsoleErrors(describeConfigForTest);
            }).then(() => {
                cleanupSpies();
            });
        };
    };

    // Store current describe config in a way accessible to it blocks
    // Use a stack to handle nested describes - stack persists during describe execution
    let currentDescribeConfig = {};
    const describeConfigStack = [];

    // Override global `describe` to track config stack
    const originalDescribe = global.describe;
    global.describe = function (name, configOrFn, fn) {
        const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
        const describeFn = isConfigObject ? fn : configOrFn;
        const describeConfigObj = isConfigObject ? configOrFn : {};

        debugLog(`Overriding describe "${name}" with config:`, describeConfigObj);

        // Push config to stack when describe starts executing
        describeConfigStack.push(describeConfigObj);
        currentDescribeConfig = describeConfigObj;

        const wrappedDescribeFn = function () {
            // Execute the describe function - all it blocks are registered synchronously here
            const result = describeFn.call(this);
            // Pop config from stack after describe body completes
            describeConfigStack.pop();
            // Restore previous config from stack (or empty if stack is empty)
            currentDescribeConfig = describeConfigStack.length > 0 
                ? describeConfigStack[describeConfigStack.length - 1] 
                : {};
            return result;
        };

        return originalDescribe.call(this, name, wrappedDescribeFn);
    };
    global.describe.only = originalDescribe.only;
    global.describe.skip = originalDescribe.skip;

    // Override global `it` and `it.only`
    const overrideIt = (originalIt, isOnly = false) => {
        return function (description, configOrFn, fn) {
            const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
            const testFn = isConfigObject ? fn : configOrFn;
            const testConfig = isConfigObject ? configOrFn : {};
            // Get current describe config from stack
            const describeConfigForTest = currentDescribeConfig || {};

            debugLog(`Overriding ${isOnly ? 'it.only' : 'it'} with config:`, testConfig);
            debugLog(`Current describe config:`, describeConfigForTest);

            if (!testFn || typeof testFn !== 'function') {
                debugLog('cypress-console-spy: testFn is not a function, skipping wrap:', testFn);
                return isConfigObject
                    ? originalIt.call(this, description, configOrFn, testFn)
                    : originalIt.call(this, description, testFn);
            }

            return isConfigObject
                ? originalIt.call(this, description, configOrFn, wrapTest(testFn, testConfig, describeConfigForTest))
                : originalIt.call(this, description, wrapTest(testFn, testConfig, describeConfigForTest));
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