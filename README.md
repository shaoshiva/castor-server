# Castor Server

The server used to broadcast screens to Castor Clients.

## Install

`npm install "git+ssh://git@git@github.com:shaoshiva/castor-server.git#master" --save`

## Usage

```js
"use strict";

const CastorServer = require('castor-server');

// Builds the server
const server = new CastorServer({
    requestToken: 'YOUR_TOKEN',
    database: {
        host     : 'YOUR_DB_HOST',
        user     : 'YOUR_DB_USER',
        password : 'YOUR_DB_PASSWORD',
        database : 'YOUR_DB_NAME',
    },
    commands: CastorServer.defaultCommands,
});

// Runs the server
server.run();

```

`YOUR_TOKEN` should be a random string, it is used to authenticate the clients.
