"use strict";

const Command = require('../Command.js');

class Reset extends Command
{
    run(params) {
        this.server.broadcast({
            action: 'reset',
        });
    }
}

module.exports = Reset;
