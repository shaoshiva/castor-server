"use strict";

const Command = require('../Command.js');

/**
 * Requests the current scenario
 */
class RequestCurrentScenario extends Command
{
    run() {
        return this.client.sendPayload({
            command: 'runScenario',
            params: {
                scenario: this.server.getCurrentScenario(),
            },
        });
    }
}

module.exports = RequestCurrentScenario;
