const defaultConfig = {
    failOnSpy: true,
    logToFile: true,
    methodsToTrack: ['error'],
    throwOnWarning: false,
    whitelist: [],
    debug: false,
};

const messageToString = (message) => {
    if (message === null) {
        return 'null';
    }

    if (message === undefined) {
        return 'undefined';
    }

    if (message instanceof Error) {
        const errorParts = [];

        if (message.name && message.name !== 'Error') {
            errorParts.push(`${message.name}:`);
        }

        if (message.message) {
            errorParts.push(message.message);
        }

        return errorParts.length > 0 ? errorParts.join(' ') : String(message);
    }

    if (Array.isArray(message)) {
        return message.map((item) => messageToString(item)).join(' ');
    }

    if (typeof message === 'object') {
        if (message.message && typeof message.message === 'string') {
            const prefix = message.name ? `${message.name}: ` : '';
            return prefix + message.message;
        }

        try {
            const serialized = JSON.stringify(message);

            if (serialized === '{}' || serialized === '[]') {
                const fallback = String(message);

                if (fallback !== '[object Object]' && fallback !== '') {
                    return fallback;
                }
            }

            return serialized;
        } catch {
            return String(message);
        }
    }

    return String(message);
};

const getIssueType = (method) => {
    if (method === 'error') {
        return 'error';
    }

    if (method === 'warn') {
        return 'warn';
    }

    return 'info';
};

const getIssueMessage = (issue) => issue.rawMessage || messageToString(issue.message);

module.exports = (Cypress, customConfig = {}) => {
    const config = { ...defaultConfig, ...customConfig };
    const consoleSpies = {};
    const allIssues = [];
    const windowsWithErrorHandlers = new WeakSet();
    const finalizationState = {
        active: false,
        processed: false,
        runtimeConfig: config,
    };

    let currentRuntimeConfig = config;
    let currentDescribeConfig = {};
    const describeConfigStack = [];

    const debugLog = (...args) => {
        if (currentRuntimeConfig.debug) {
            console.log(...args);
        }
    };

    const mergeConsoleDaemonOverrides = (parentOverride = {}, nextOverride = {}) => ({
        ...parentOverride,
        ...nextOverride,
        whitelist: [
            ...(parentOverride.whitelist || []),
            ...(nextOverride.whitelist || []),
        ],
    });

    const buildInheritedDescribeConfig = (rawDescribeConfig = {}) => {
        const parentConfig = describeConfigStack.length > 0
            ? describeConfigStack[describeConfigStack.length - 1]
            : {};
        const parentConsoleDaemon = parentConfig.consoleDaemon || {};
        const nextConsoleDaemon = rawDescribeConfig.consoleDaemon || {};

        return {
            consoleDaemon: mergeConsoleDaemonOverrides(parentConsoleDaemon, nextConsoleDaemon),
        };
    };

    const getMergedConfig = (testConfig = {}, describeConfigForTest = {}) => {
        const describeConsoleDaemon = describeConfigForTest.consoleDaemon || {};
        const testConsoleDaemon = testConfig.consoleDaemon || {};

        const mergedConfig = {
            ...defaultConfig,
            ...config,
            ...describeConsoleDaemon,
            ...testConsoleDaemon,
            whitelist: [
                ...(config.whitelist || []),
                ...(describeConsoleDaemon.whitelist || []),
                ...(testConsoleDaemon.whitelist || []),
            ],
        };

        debugLog('Merged config:', {
            global: config,
            describe: describeConsoleDaemon,
            test: testConsoleDaemon,
            merged: mergedConfig,
        });

        return mergedConfig;
    };

    const isWhitelisted = (message, whitelist) => whitelist.some((pattern) => {
        if (typeof pattern === 'string') {
            return message.includes(pattern);
        }

        return pattern.test(message);
    });

    const reportIssuesToCommandLog = (issues) => {
        if (issues.length === 0) {
            return cy.wrap(null, { log: false });
        }

        const reportCommandName = typeof cy.fatal === 'function' ? 'fatal' : 'log';
        const reportMessage = [
            `[cypress-console-spy] Detected ${issues.length} console issue(s)`,
            ...issues.map((issue) => `[${issue.type}] ${getIssueMessage(issue)}`),
        ].join('\n');

        return cy.then(() => cy[reportCommandName](reportMessage));
    };

    const collectSpyCalls = (method, spy) => {
        if (!spy?.getCalls) {
            return;
        }

        const newIssues = spy.getCalls().map((call) => {
            const rawMessage = call.args
                .map((arg) => messageToString(arg))
                .join(' ')
                .trim();

            return {
                type: getIssueType(method),
                message: call.args,
                rawMessage,
            };
        });

        allIssues.push(...newIssues);
        debugLog(`Collected ${newIssues.length} calls for console.${method}`);
    };

    const restoreAllSpies = () => {
        Object.values(consoleSpies).forEach((spy) => {
            if (spy?.restore) {
                try {
                    spy.restore();
                } catch (error) {
                    debugLog('Failed to restore spy:', error.message);
                }
            }
        });

        Object.keys(consoleSpies).forEach((key) => delete consoleSpies[key]);
    };

    const setupConsoleSpy = (win, runtimeConfig) => {
        Object.keys(consoleSpies).forEach((method) => {
            collectSpyCalls(method, consoleSpies[method]);
        });
        restoreAllSpies();

        runtimeConfig.methodsToTrack.forEach((method) => {
            if (!win.console || !win.console[method]) {
                return;
            }

            try {
                consoleSpies[method] = cy.spy(win.console, method);
                debugLog(`Spy created for console.${method}`);
            } catch (error) {
                debugLog(`Failed to create spy for console.${method}:`, error.message);
            }
        });

        if (!windowsWithErrorHandlers.has(win)) {
            windowsWithErrorHandlers.add(win);
            win.addEventListener('error', (event) => {
                const errorMessage = `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}`;

                allIssues.push({
                    type: 'error',
                    message: [errorMessage],
                    rawMessage: event.message,
                });

                debugLog(`Captured uncaught error: ${errorMessage}`);
            });
        }
    };

    const processIssues = (issues, runtimeConfig) => {
        if (issues.length === 0) {
            return cy.wrap(null, { log: false });
        }

        return reportIssuesToCommandLog(issues).then(() => cy.task('processConsoleBatch', {
            issues: issues.map((issue) => ({
                type: issue.type,
                message: getIssueMessage(issue),
            })),
            testPath: Cypress.spec.relative,
            logToFile: runtimeConfig.logToFile,
        }, { log: false }));
    };

    const checkConsoleIssues = (runtimeConfig) => {
        const filteredIssues = allIssues.filter((issue) => {
            const message = getIssueMessage(issue);
            const whitelisted = isWhitelisted(message, runtimeConfig.whitelist);

            if (whitelisted) {
                debugLog(`Message matched whitelist: ${message}`);
            }

            return !whitelisted;
        });

        const failOnIssues = filteredIssues.filter((issue) => {
            if (issue.type === 'error') {
                return true;
            }

            return issue.type === 'warn' && runtimeConfig.throwOnWarning;
        });

        debugLog('Filtered issues:', filteredIssues);
        debugLog('Failing issues:', failOnIssues);

        return processIssues(filteredIssues, runtimeConfig).then(() => {
            if (failOnIssues.length === 0 || !runtimeConfig.failOnSpy) {
                return null;
            }

            const errorMessage = [
                `Console errors detected (${failOnIssues.length}):`,
                ...failOnIssues.map((issue) => `• ${getIssueMessage(issue)}`),
            ].join('\n');
            const consoleError = new Error(errorMessage);

            consoleError.name = 'ConsoleErrors';

            Cypress.log({
                name: 'Console Errors',
                message: errorMessage,
                consoleProps: () => ({
                    'Detected Errors': failOnIssues.map((issue) => getIssueMessage(issue)),
                    Whitelist: runtimeConfig.whitelist,
                    Recommendations: 'Check the browser console output or add to whitelist',
                }),
            });

            throw consoleError;
        });
    };

    const finalizeIssueCollection = (runtimeConfig) => {
        runtimeConfig.methodsToTrack.forEach((method) => {
            collectSpyCalls(method, consoleSpies[method]);
        });

        return checkConsoleIssues(runtimeConfig);
    };

    const cleanupAfterTest = () => {
        restoreAllSpies();
        allIssues.length = 0;
        currentRuntimeConfig = config;
        finalizationState.active = false;
        finalizationState.processed = false;
        finalizationState.runtimeConfig = config;
    };

    const wrapTest = (testFn, testConfig, describeConfigForTest = {}) => function wrappedTest() {
        const runtimeConfig = getMergedConfig(testConfig, describeConfigForTest);

        currentRuntimeConfig = runtimeConfig;
        allIssues.length = 0;
        restoreAllSpies();
        finalizationState.active = true;
        finalizationState.processed = false;
        finalizationState.runtimeConfig = runtimeConfig;

        const runFinalChecks = () => finalizeIssueCollection(runtimeConfig);

        return cy.window()
            .then((win) => {
                setupConsoleSpy(win, runtimeConfig);
                return testFn.call(this);
            })
            .then(
                () => {
                    return runFinalChecks().then((result) => {
                        finalizationState.processed = true;
                        return result;
                    });
                },
                (testError) => {
                    return runFinalChecks().then(
                        () => {
                            finalizationState.processed = true;
                            throw testError;
                        },
                        () => {
                            finalizationState.processed = true;
                            throw testError;
                        },
                    );
                },
            )
            .then(
                (result) => {
                    cleanupAfterTest();
                    return result;
                },
                (error) => {
                    cleanupAfterTest();
                    throw error;
                },
            );
    };

    const overrideDescribe = (originalDescribeMethod) => function overriddenDescribe(name, configOrFn, fn) {
        const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
        const describeFn = isConfigObject ? fn : configOrFn;
        const describeConfigObj = isConfigObject ? configOrFn : undefined;
        const inheritedDescribeConfig = buildInheritedDescribeConfig(describeConfigObj);

        debugLog(`Overriding describe "${name}" with config:`, describeConfigObj);

        const wrappedDescribeFn = function wrappedDescribeBody() {
            describeConfigStack.push(inheritedDescribeConfig);
            currentDescribeConfig = inheritedDescribeConfig;

            try {
                return describeFn.call(this);
            } finally {
                describeConfigStack.pop();
                currentDescribeConfig = describeConfigStack.length > 0
                    ? describeConfigStack[describeConfigStack.length - 1]
                    : {};
            }
        };

        return isConfigObject
            ? originalDescribeMethod.call(this, name, describeConfigObj, wrappedDescribeFn)
            : originalDescribeMethod.call(this, name, wrappedDescribeFn);
    };

    const overrideIt = (originalItMethod, markOnly = false) => function overriddenIt(description, configOrFn, fn) {
        const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
        const testFn = isConfigObject ? fn : configOrFn;
        const testConfig = isConfigObject ? configOrFn : {};
        const describeConfigForTest = currentDescribeConfig || {};

        if (typeof testFn !== 'function') {
            const fallbackTest = isConfigObject
                ? originalItMethod.call(this, description, configOrFn, testFn)
                : originalItMethod.call(this, description, testFn);

            if (markOnly && fallbackTest?.markOnly) {
                fallbackTest.markOnly();
            }

            return fallbackTest;
        }

        const createdTest = isConfigObject
            ? originalItMethod.call(this, description, configOrFn, wrapTest(testFn, testConfig, describeConfigForTest))
            : originalItMethod.call(this, description, wrapTest(testFn, testConfig, describeConfigForTest));

        if (markOnly && createdTest?.markOnly) {
            createdTest.markOnly();
        }

        return createdTest;
    };

    const originalDescribe = global.describe;
    global.describe = overrideDescribe(originalDescribe);
    global.describe.only = overrideDescribe(originalDescribe.only);
    global.describe.skip = overrideDescribe(originalDescribe.skip);

    const originalIt = global.it;
    global.it = overrideIt(originalIt);
    global.it.only = overrideIt(originalIt, true);
    global.it.skip = function overriddenItSkip(description, configOrFn, fn) {
        const isConfigObject = typeof configOrFn === 'object' && configOrFn !== null;
        const testFn = isConfigObject ? fn : configOrFn;

        return isConfigObject
            ? originalIt.skip.call(this, description, configOrFn, testFn)
            : originalIt.skip.call(this, description, testFn);
    };

    afterEach(function finalizeFailedTestRun() {
        if (!finalizationState.active || finalizationState.processed) {
            return;
        }

        const runtimeConfig = {
            ...finalizationState.runtimeConfig,
            failOnSpy: this.currentTest?.state === 'passed'
                ? finalizationState.runtimeConfig.failOnSpy
                : false,
        };

        finalizationState.processed = true;

        return cy.then(() => finalizeIssueCollection(runtimeConfig))
            .then(
                () => {
                    cleanupAfterTest();
                },
                (error) => {
                    cleanupAfterTest();
                    throw error;
                },
            );
    });

    Cypress.on('window:load', (win) => {
        setupConsoleSpy(win, currentRuntimeConfig);
    });
};
