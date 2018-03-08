# Novius Live Server

The server used to broadcast screens to Novius Live Clients.

## Install

`npm install "git+ssh://git@gitlab.lyon.novius.fr:novius/novius-live-server.git#master" --save`

## Usage

```js
"use strict";

const NoviusLiveServer = require('novius-live-server');

// Builds the server
const server = new NoviusLiveServer({
    requestToken: 'YOUR_TOKEN',
    database: {
        host     : 'YOUR_DB_HOST',
        user     : 'YOUR_DB_USER',
        password : 'YOUR_DB_PASSWORD',
        database : 'YOUR_DB_NAME',
    },
    commands: NoviusLiveServer.defaultCommands,
});

// Runs the server
server.run();

```

`YOUR_TOKEN` should be a random string, it is used to authenticate the clients.
