const { defineConfig } = require('cypress');
const { server } = require('./index');

module.exports = defineConfig({
    e2e: {
        setupNodeEvents(on, config) {
            // Подключаем серверную часть плагина
            server(on, config);
            return config;
        },
        specPattern: 'cypress/e2e/**/*.cy.js',
        supportFile: 'cypress/support/e2e.js',
        video: false,
        screenshotOnRunFailure: false,
        env: {
            consoleDaemon: {
                failOnSpy: true,
                logToFile: true,
                methodsToTrack: ['error'],
                throwOnWarning: false,
                whitelist: [],
                debug: false,
            },
        },
    },
});
