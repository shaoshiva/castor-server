"use strict";

/**
 * Abstract class for commands
 */
class Command
{
    constructor(server, client, params)
    {
        this.server = server;
        this.client = client;
        this.params = params;
    }

    run()
    {
        // Do the command's job in this method
    }
}

module.exports = Command;
