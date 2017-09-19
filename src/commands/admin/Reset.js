"use strict";

const Command = require('../../Command.js');

class Reset extends Command
{
    run(params) {
        return this.server.broadcast({
            command: 'reset',
        });
    }
}

module.exports = Reset;
