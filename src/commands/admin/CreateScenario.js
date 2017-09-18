"use strict";

const Command = require('../../Command.js');

/**
 * Creates a scenario
 */
class CreateScenario extends Command
{
    run() {
        return this.server.createScenario(this.params.options).then((id) => {
            // Auto-run the created scenario
            if (this.params.run) {
                this.server.runNextScenario(this.server.requestScenarioById(id));
            }
        });
    }
}

module.exports = CreateScenario;
