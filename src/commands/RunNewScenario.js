"use strict";

const Command = require('../Command.js');

/**
 * Runs a new scenario in the timeline
 */

class RunNewScenario extends Command
{
    run(params) {
        this.server.runNewScenario();
    }
}

module.exports = RunNewScenario;
