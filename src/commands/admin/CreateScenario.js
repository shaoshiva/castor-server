"use strict";

const Command = require('../../Command.js');

/**
 * Creates a scenario
 */
class CreateScenario extends Command
{
    run() {
        let scenario = this.params.scenario;

        // Sets a default display limit
        if (typeof scenario.display_limit === 'undefined') {
            scenario.display_limit = 1;
        }

        return this.server.createRecordFromScenario(scenario)
            .then((id) => {
                // Auto-run the created scenario
                if (this.params.run) {
                    this.server.runNextScenario(this.server.requestScenarioById(id));
                }
            })
        ;
    }
}

module.exports = CreateScenario;
