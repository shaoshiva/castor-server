"use strict";

const Command = require('../Command.js');

/**
 * Runs the given scenario
 */
class RunScenario extends Command
{
    run() {
        this.server.runNewScenario(this.params.id, this.params.options);
    }
}

module.exports = RunScenario;
