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
        if (!scenario.display_limit) {
            scenario.display_limit = 1;
        }

        return this.server.createScenario(scenario)
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
