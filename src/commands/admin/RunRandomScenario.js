"use strict";

const Command = require('../../Command.js');

/**
 * Runs the given scenario
 */
class RunRandomScenario extends Command
{
    run() {
        return this.server.runNextScenario(this.server.requestRandomScenario());
    }
}

module.exports = RunRandomScenario;
