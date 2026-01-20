/// <reference types="cypress" />

declare module '@mknrt/cypress-console-spy' {
    /**
     * Configuration options for cypress-console-spy
     */
    export interface ConsoleDaemonConfig {
        /**
         * Whether to fail the test when console errors are detected
         * @default true
         */
        failOnSpy?: boolean;

        /**
         * Whether to save console issues to log files
         * @default true
         */
        logToFile?: boolean;

        /**
         * Console methods to monitor
         * @default ['error']
         * @example ['error', 'warn', 'log']
         */
        methodsToTrack?: Array<'error' | 'warn' | 'log' | 'info' | 'debug'>;

        /**
         * Whether to treat warnings as critical errors (fails test if failOnSpy is true)
         * @default false
         */
        throwOnWarning?: boolean;

        /**
         * Patterns to ignore when checking console issues.
         * Can be strings (partial match) or RegExp patterns.
         * @default []
         * @example ['socket.io', /ResizeObserver/, 'known warning']
         */
        whitelist?: Array<string | RegExp>;

        /**
         * Enable debug logging in browser console
         * @default false
         */
        debug?: boolean;

        /**
         * Custom log directory path (server-side only)
         * @default 'cypress/logs'
         */
        logDir?: string;
    }

    /**
     * Console issue detected during test
     */
    export interface ConsoleIssue {
        /** Type of the issue */
        type: 'error' | 'warn' | 'info';
        /** Message content */
        message: string;
    }

    /**
     * Error statistics collected during test run
     */
    export interface ErrorStats {
        /** Number of errors detected */
        errors: number;
        /** Number of warnings detected */
        warnings: number;
        /** Detailed list of all issues */
        details: Array<{
            type: string;
            message: string;
        }>;
    }

    /**
     * Test configuration with consoleDaemon settings
     */
    export interface TestConfigWithConsoleDaemon {
        consoleDaemon?: Partial<ConsoleDaemonConfig>;
        [key: string]: unknown;
    }

    /**
     * Client-side plugin initialization function.
     * Call this in cypress/support/e2e.js
     * 
     * @param Cypress - Cypress global object
     * @param config - Optional configuration options
     * 
     * @example
     * ```javascript
     * // cypress/support/e2e.js
     * const { client } = require('@mknrt/cypress-console-spy');
     * client(Cypress, Cypress.env('consoleDaemon'));
     * ```
     */
    export function client(
        Cypress: Cypress.Cypress,
        config?: ConsoleDaemonConfig
    ): void;

    /**
     * Server-side plugin initialization function.
     * Call this in cypress.config.js setupNodeEvents
     * 
     * @param on - Cypress plugin events
     * @param config - Cypress configuration
     * 
     * @example
     * ```javascript
     * // cypress.config.js
     * const { server } = require('@mknrt/cypress-console-spy');
     * 
     * module.exports = defineConfig({
     *   e2e: {
     *     setupNodeEvents(on, config) {
     *       server(on, config);
     *       return config;
     *     },
     *   },
     * });
     * ```
     */
    export function server(
        on: Cypress.PluginEvents,
        config: Cypress.PluginConfigOptions
    ): void;
}

// Extend Cypress namespace for custom tasks
declare namespace Cypress {
    interface Chainable {
        /**
         * Process console issues batch (internal use)
         */
        task(
            event: 'processConsoleBatch',
            arg: {
                issues: Array<{ type: string; message: string }>;
                testPath: string;
                logToFile: boolean;
            },
            options?: Partial<Loggable & Timeoutable>
        ): Chainable<null>;

        /**
         * Get current error statistics
         */
        task(event: 'getErrorStats'): Chainable<{
            errors: number;
            warnings: number;
            details: Array<{ type: string; message: string }>;
        }>;

        /**
         * Reset error statistics
         */
        task(event: 'resetErrorStats'): Chainable<null>;

        /**
         * Enable or disable debug mode
         */
        task(event: 'setDebugMode', debug: boolean): Chainable<null>;

        /**
         * Log console error (legacy)
         */
        task(
            event: 'logConsoleError',
            arg: { message: unknown; type: string },
            options?: Partial<Loggable & Timeoutable>
        ): Chainable<null>;

        /**
         * Save console error to file (legacy)
         */
        task(
            event: 'saveConsoleErrorToFile',
            arg: { message: unknown; type: string; testPath: string },
            options?: Partial<Loggable & Timeoutable>
        ): Chainable<null>;

        /**
         * Notify about critical error (legacy)
         */
        task(
            event: 'notifyCriticalError',
            arg: { message: unknown; type: string },
            options?: Partial<Loggable & Timeoutable>
        ): Chainable<null>;
    }
}

// Augment global describe and it to support consoleDaemon config
declare global {
    namespace Mocha {
        interface SuiteFunction {
            (
                title: string,
                config: import('@mknrt/cypress-console-spy').TestConfigWithConsoleDaemon,
                fn: (this: Suite) => void
            ): Suite;
        }

        interface TestFunction {
            (
                title: string,
                config: import('@mknrt/cypress-console-spy').TestConfigWithConsoleDaemon,
                fn: Func
            ): Test;
        }

        interface ExclusiveTestFunction {
            (
                title: string,
                config: import('@mknrt/cypress-console-spy').TestConfigWithConsoleDaemon,
                fn: Func
            ): Test;
        }
    }
}

export {};
