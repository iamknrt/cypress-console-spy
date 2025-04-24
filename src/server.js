const fs = require('fs');
const path = require('path');

module.exports = (on, config) => {
    let errorStats = { errors: 0, warnings: 0, details: [] };
    let debugMode = false;

    function debugLog(...args) {
        if (debugMode) {
            console.log(...args);
        }
    }

    on('task', {
        // Log console errors and update statistics
        logConsoleError({ message, type }) {
            debugLog(`[${type.toUpperCase()}] in console:`, message);
            errorStats[type === 'error' ? 'errors' : 'warnings']++;
            errorStats.details.push({ type, message: message.join(' ') });
            return null;
        },

        // Save console errors to log files
        saveConsoleErrorToFile({ message, type, testPath }) {
            try {
                debugLog('Received saveConsoleErrorToFile task with:', { message, type, testPath });
                if (!testPath) {
                    console.error('Error: testPath is undefined or empty');
                    return null;
                }
                const testName = path.basename(testPath, path.extname(testPath)) || 'unknown_test';
                const logDir = path.join(process.cwd(), 'cypress', 'logs');

                debugLog('Current working directory:', process.cwd());
                debugLog('Log directory:', logDir);

                if (!fs.existsSync(logDir)) {
                    debugLog('Creating directory:', logDir);
                    fs.mkdirSync(logDir, { recursive: true });
                }

                const logPath = path.join(logDir, `${testName}.log`);
                debugLog('Full log path:', logPath);
                const logMessage = `[${new Date().toISOString()}] [${type.toUpperCase()}]: ${message.join(' ')}\n`;
                fs.appendFileSync(logPath, logMessage, 'utf8');
                debugLog('Log saved successfully to:', logPath);
                return null;
            } catch (error) {
                console.error('Error in saveConsoleErrorToFile:', error);
                return null;
            }
        },

        // Notify about critical errors
        notifyCriticalError({ message, type }) {
            console.log(`CRITICAL NOTIFICATION [${type.toUpperCase()}]:`, message);
            return null;
        },

        // Get current error statistics
        getErrorStats() {
            return errorStats;
        },

        // Reset error statistics
        resetErrorStats() {
            errorStats = { errors: 0, warnings: 0, details: [] };
            return null;
        },

        // Set debug mode
        setDebugMode(debug) {
            debugMode = debug;
            return null;
        },
    });

    // Reset stats before test run
    on('before:run', () => {
        errorStats = { errors: 0, warnings: 0, details: [] };
        const logPath = path.join(process.cwd(), 'console_errors.log');
        if (fs.existsSync(logPath)) {
            fs.unlinkSync(logPath);
        }
    });

    // Display summary after test run
    on('after:run', () => {
        console.log('Console Error Statistics:');
        console.log(`Errors: ${errorStats.errors}`);
        console.log(`Warnings: ${errorStats.warnings}`);
        if (debugMode) {
            console.log('Details:', errorStats.details);
        }
    });
};