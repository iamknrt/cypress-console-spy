const fs = require('fs');
const path = require('path');

module.exports = (on, config) => {
    let errorStats = { errors: 0, warnings: 0, details: [] };
    let debugMode = false;
    let logDirCreated = false;
    
    // Get log directory from config or use default
    const getLogDir = () => {
        const customLogDir = config?.expose?.consoleDaemon?.logDir || config?.env?.consoleDaemon?.logDir;
        return customLogDir || path.join(process.cwd(), 'cypress', 'logs');
    };

    function debugLog(...args) {
        if (debugMode) {
            console.log('[cypress-console-spy]', ...args);
        }
    }

    // Ensure log directory exists (called once)
    const ensureLogDir = () => {
        if (logDirCreated) return;
        const logDir = getLogDir();
        if (!fs.existsSync(logDir)) {
            debugLog('Creating log directory:', logDir);
            fs.mkdirSync(logDir, { recursive: true });
        }
        logDirCreated = true;
    };

    // Async file append with error handling
    const appendToLogFile = async (logPath, content) => {
        try {
            await fs.promises.appendFile(logPath, content, 'utf8');
            debugLog('Log saved to:', logPath);
        } catch (error) {
            console.error('[cypress-console-spy] Error writing to log file:', error.message);
        }
    };

    on('task', {
        // Process all console issues in a single batch call for better performance
        async processConsoleBatch({ issues, testPath, logToFile }) {
            if (!issues || issues.length === 0) {
                return null;
            }

            debugLog(`Processing batch of ${issues.length} issues`);

            // Update statistics
            issues.forEach((issue) => {
                const statKey = issue.type === 'error' ? 'errors' : 'warnings';
                errorStats[statKey]++;
                errorStats.details.push({ type: issue.type, message: issue.message });
                debugLog(`[${issue.type.toUpperCase()}] in console:`, issue.message);
            });

            // Log to file if enabled
            if (logToFile && testPath) {
                ensureLogDir();
                const testName = path.basename(testPath, path.extname(testPath)) || 'unknown_test';
                const logPath = path.join(getLogDir(), `${testName}.log`);
                
                const logContent = issues
                    .map((issue) => `[${new Date().toISOString()}] [${issue.type.toUpperCase()}]: ${issue.message}`)
                    .join('\n') + '\n';
                
                await appendToLogFile(logPath, logContent);
            }

            // Log critical errors to console
            const criticalErrors = issues.filter((issue) => issue.type === 'error');
            if (criticalErrors.length > 0) {
                console.log(`[cypress-console-spy] CRITICAL: ${criticalErrors.length} error(s) detected`);
                criticalErrors.forEach((error) => {
                    console.log(`  • ${error.message}`);
                });
            }

            return null;
        },

        // Legacy: Log console errors and update statistics (kept for backward compatibility)
        logConsoleError({ message, type }) {
            const messageStr = Array.isArray(message) ? message.join(' ') : String(message);
            debugLog(`[${type.toUpperCase()}] in console:`, messageStr);
            errorStats[type === 'error' ? 'errors' : 'warnings']++;
            errorStats.details.push({ type, message: messageStr });
            return null;
        },

        // Legacy: Save console errors to log files (kept for backward compatibility)
        async saveConsoleErrorToFile({ message, type, testPath }) {
            try {
                debugLog('Received saveConsoleErrorToFile task with:', { message, type, testPath });
                if (!testPath) {
                    console.error('[cypress-console-spy] Error: testPath is undefined or empty');
                    return null;
                }
                
                ensureLogDir();
                const testName = path.basename(testPath, path.extname(testPath)) || 'unknown_test';
                const logPath = path.join(getLogDir(), `${testName}.log`);
                const messageStr = Array.isArray(message) ? message.join(' ') : String(message);
                const logMessage = `[${new Date().toISOString()}] [${type.toUpperCase()}]: ${messageStr}\n`;
                
                await appendToLogFile(logPath, logMessage);
                return null;
            } catch (error) {
                console.error('[cypress-console-spy] Error in saveConsoleErrorToFile:', error);
                return null;
            }
        },

        // Legacy: Notify about critical errors (kept for backward compatibility)
        notifyCriticalError({ message, type }) {
            const messageStr = Array.isArray(message) ? message.join(' ') : String(message);
            console.log(`[cypress-console-spy] CRITICAL NOTIFICATION [${type.toUpperCase()}]:`, messageStr);
            return null;
        },

        // Get current error statistics
        getErrorStats() {
            return { ...errorStats };
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

    // Reset stats and ensure log directory before test run
    on('before:run', () => {
        errorStats = { errors: 0, warnings: 0, details: [] };
        logDirCreated = false;
        
        // Ensure log directory exists at the start
        ensureLogDir();
        
        // Clean up old global log file if exists
        const oldLogPath = path.join(process.cwd(), 'console_errors.log');
        if (fs.existsSync(oldLogPath)) {
            try {
                fs.unlinkSync(oldLogPath);
            } catch (e) {
                debugLog('Failed to delete old log file:', e.message);
            }
        }
    });

    // Display summary after test run
    on('after:run', () => {
        console.log('\n[cypress-console-spy] Console Error Statistics:');
        console.log(`  Errors: ${errorStats.errors}`);
        console.log(`  Warnings: ${errorStats.warnings}`);
        if (debugMode && errorStats.details.length > 0) {
            console.log('  Details:');
            errorStats.details.forEach((detail, index) => {
                console.log(`    ${index + 1}. [${detail.type}] ${detail.message}`);
            });
        }
    });
};