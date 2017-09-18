const Server = require('./src/Server.js');

const commands = require('./config/commands.js');

const server = new Server({
    requestToken: 'V?Tv)k9hGvM?~${MAk5sT%NfdN\N~!$TdZGuB%cD',
    database: {
        host     : 'my57.lyon.novius.fr',
        user     : 'root',
        password : 'novius',
        database : 'novius_live',
    },
    commands,
});

server.run();
