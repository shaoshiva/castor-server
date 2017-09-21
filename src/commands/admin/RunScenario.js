"use strict";

const Command = require('../../Command.js');

/**
 * Runs the given scenario
 */
class RunScenario extends Command
{
    run() {
        this.server.runNextScenario(
            // Creates a promise to merge the custom options with the requested scenario
            new Promise((resolve, reject) => {
                // Requests the scenario by ID
                this.server.requestScenarioById(this.params.id, this.params.options)
                    .then((scenario) => {
                        // Merges the options with the requested scenario
                        scenario = Object.assign(scenario, this.params.options || {});
                        // Resolves the custom promise
                        resolve(scenario);
                    })
                    .catch(reject)
                ;
            })
        );
    }
}

module.exports = RunScenario;
