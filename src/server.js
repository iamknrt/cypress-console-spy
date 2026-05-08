const fs = require('fs');
const path = require('path');

const createEmptyStats = () => ({
    errors: 0,
    warnings: 0,
    info: 0,
    details: [],
});

const getStatKey = (type) => {
    if (type === 'error') {
        return 'errors';
    }

    if (type === 'warn') {
        return 'warnings';
    }

    return 'info';
};

const buildLogFileName = (testPath) => {
    const relativePathWithoutExt = testPath.replace(path.extname(testPath), '');

    return `${relativePathWithoutExt.replace(/[\\/]/g, '__') || 'unknown_test'}.log`;
};

module.exports = (on, config) => {
    let errorStats = createEmptyStats();
    let debugMode = false;
    let logDirCreated = false;

    const getLogDir = () => {
        const customLogDir = config?.expose?.consoleDaemon?.logDir || config?.env?.consoleDaemon?.logDir;
        return customLogDir || path.join(process.cwd(), 'cypress', 'logs');
    };

    const debugLog = (...args) => {
        if (debugMode) {
            console.log('[cypress-console-spy]', ...args);
        }
    };

    const ensureLogDir = () => {
        if (logDirCreated) {
            return;
        }

        const logDir = getLogDir();

        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
            debugLog('Creating log directory:', logDir);
        }

        logDirCreated = true;
    };

    const appendToLogFile = async (logPath, content) => {
        try {
            await fs.promises.appendFile(logPath, content, 'utf8');
            debugLog('Log saved to:', logPath);
        } catch (error) {
            console.error('[cypress-console-spy] Error writing to log file:', error.message);
        }
    };

    on('task', {
        async processConsoleBatch({ issues, testPath, logToFile }) {
            if (!issues || issues.length === 0) {
                return null;
            }

            issues.forEach((issue) => {
                const statKey = getStatKey(issue.type);
                errorStats[statKey]++;
                errorStats.details.push({ type: issue.type, message: issue.message });
                debugLog(`[${issue.type.toUpperCase()}] in console:`, issue.message);
            });

            if (logToFile && testPath) {
                ensureLogDir();

                const logPath = path.join(getLogDir(), buildLogFileName(testPath));
                const logContent = issues
                    .map((issue) => `[${new Date().toISOString()}] [${issue.type.toUpperCase()}]: ${issue.message}`)
                    .join('\n') + '\n';

                await appendToLogFile(logPath, logContent);
            }

            const criticalErrors = issues.filter((issue) => issue.type === 'error');

            if (criticalErrors.length > 0) {
                console.log(`[cypress-console-spy] CRITICAL: ${criticalErrors.length} error(s) detected`);
                criticalErrors.forEach((error) => {
                    console.log(`  • ${error.message}`);
                });
            }

            return null;
        },

        logConsoleError({ message, type }) {
            const messageStr = Array.isArray(message) ? message.join(' ') : String(message);
            const statKey = getStatKey(type);

            errorStats[statKey]++;
            errorStats.details.push({ type, message: messageStr });
            debugLog(`[${type.toUpperCase()}] in console:`, messageStr);

            return null;
        },

        async saveConsoleErrorToFile({ message, type, testPath }) {
            try {
                if (!testPath) {
                    console.error('[cypress-console-spy] Error: testPath is undefined or empty');
                    return null;
                }

                ensureLogDir();

                const logPath = path.join(getLogDir(), buildLogFileName(testPath));
                const messageStr = Array.isArray(message) ? message.join(' ') : String(message);
                const logMessage = `[${new Date().toISOString()}] [${type.toUpperCase()}]: ${messageStr}\n`;

                await appendToLogFile(logPath, logMessage);
                return null;
            } catch (error) {
                console.error('[cypress-console-spy] Error in saveConsoleErrorToFile:', error);
                return null;
            }
        },

        notifyCriticalError({ message, type }) {
            const messageStr = Array.isArray(message) ? message.join(' ') : String(message);

            console.log(`[cypress-console-spy] CRITICAL NOTIFICATION [${type.toUpperCase()}]:`, messageStr);
            return null;
        },

        getErrorStats() {
            return {
                ...errorStats,
                details: [...errorStats.details],
            };
        },

        resetErrorStats() {
            errorStats = createEmptyStats();
            return null;
        },

        setDebugMode(debug) {
            debugMode = debug;
            return null;
        },
    });

    on('before:run', () => {
        errorStats = createEmptyStats();
        logDirCreated = false;
        ensureLogDir();

        const oldLogPath = path.join(process.cwd(), 'console_errors.log');

        if (fs.existsSync(oldLogPath)) {
            try {
                fs.unlinkSync(oldLogPath);
            } catch (error) {
                debugLog('Failed to delete old log file:', error.message);
            }
        }
    });

    on('after:run', () => {
        console.log('\n[cypress-console-spy] Console Error Statistics:');
        console.log(`  Errors: ${errorStats.errors}`);
        console.log(`  Warnings: ${errorStats.warnings}`);
        console.log(`  Info: ${errorStats.info}`);

        if (debugMode && errorStats.details.length > 0) {
            console.log('  Details:');
            errorStats.details.forEach((detail, index) => {
                console.log(`    ${index + 1}. [${detail.type}] ${detail.message}`);
            });
        }
    });
};
