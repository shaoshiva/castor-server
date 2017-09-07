const fs = require('fs');
const WebSocket = require('ws');

const REQUEST_TOKEN = 'V?Tv)k9hGvM?~${MAk5sT%NfdN\N~!$TdZGuB%cD';

const DEFAULT_SCENARIO_TIMEOUT = 60000;

// Creates the websocket server
const wss = new WebSocket.Server({
    port: 8099,
    origin: '*',
});

/**
 * Available scenarios
 */
const scenarios = [
    {
        title: 'Pull requests',
        timeout: 60000,
        handler: 'iframe',
        handlerOptions: {
            url: 'http://pascal.lyon.novius.fr/git/pulls/',
            autoScroll: true,
            autoScrollSpeed: 50,
            // zoom: 1.2,
        },
    },
    {
        title: 'Demo message',
        timeout: 60000,
        handler: 'html',
        handlerOptions: {
            content: fs.readFileSync('views/message.html').toString(),
        },
    }
    // {
    //     title: 'Novius.com',
    //     timeout: 60000,
    //     handler: (next) => ScenarioHandlers.iframe(next, $app, {
    //         url: 'http://www.novius.com',
    //     }),
    // },
    // {
    //     title: 'Laravel.com',
    //     timeout: 20000,
    //     handler: (next) => ScenarioHandlers.iframe(next, $app, {
    //         url: 'https://laravel.com/',
    //     }),
    // },
];

/**
 * On new connection
 */
wss.on('connection', function connection(ws, req) {

    console.log('New connection from ', req.connection.remoteAddress);

    // Implements a method to send an object
    ws.sendObject = function (data) {
        ws.send(JSON.stringify(data));
    };

    // Greetings
    ws.send('Hello, I am the server.');

    // On message receive
    ws.on('message', function incoming(message) {
        console.log('Incoming request');
        handleMessage(message, ws);
        console.log('');
    });
});

/**
 * Resets the clients (force reloading each client's page, for example to force updating the scripts)
 *
 * @param scenario
 */
function runScenario(scenario) {
    // Broadcast to every client
    console.log('Broadcasting to ' + wss.clients.size + ' client(s)');
    wss.clients.forEach(function each(client) {

        if (client.readyState === WebSocket.OPEN) {

            console.log('Sending to client ', client._socket.remoteAddress);
            client.sendObject({
                action: 'runScenario',
                data: scenario
            });
            // ws.send({ action: 'reset' });
        }
    });

    console.log('End of broadcast');
    console.log('');

}

/**
 * Runs the next scenario
 */
function nextScenario() {
    var scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

    runScenario(scenario);

    // Runs the timer for next scenario
    setTimeout(nextScenario, scenario.timeout || DEFAULT_SCENARIO_TIMEOUT);
}

/**
 * Starts the scenario timeline
 */
function startScenarioTimeline() {
    nextScenario();
}

function debug(data) {
    console.log('[DEBUG] ', data);
}

/**
 * Handles an incoming message
 *
 * @param message
 * @param ws
 */
function handleMessage(message, ws) {
    // Tries parsing the message as JSON
    try {
        var messageObject = JSON.parse(message);
        if (typeof messageObject === 'object') {
            message = messageObject;
        }
    } catch (e) {
        debug(e);
    }

    // Checks format of message
    if (typeof message !== 'object') {
        console.warn('Invalid request format');
        return;
    }

    // Checks the token
    if (message.token !== REQUEST_TOKEN) {
        console.warn('Invalid token: ', message.token); // @todo should we really print the invalid token ?
        return;
    }

    var data = message.data;
    debug(data);

    // Checks if action is specified
    if (typeof data.action === 'undefined') {
        console.warn('No action specified');
        return;
    }

    // Handles actions
    switch (data.action) {

        // Gets the next scenario
        case 'getNextScenario':

            var nextScenario = scenarios[Math.floor(Math.random() * scenarios.length)];

            // Send it back to the client
            ws.sendObject({
                action: 'runScenario',
                data: nextScenario,
            });
            break;
    }
}

startScenarioTimeline();
