"use strict";

const fs            = require('fs');
const WebSocket     = require('ws');
const mysql         = require('mysql');

class Server
{
    constructor(options)
    {
        this.options = Object.assign({
            requestToken: '',
            scenarioTimeout: 5000,
            database: {
                host     : 'localhost',
                user     : 'root',
                password : '',
                database : 'server',
            },
        }, options || {});

        this.setupDatabaseConnection();

        this.setupExitHandler();

        this.setupWebSocket();
    }

    /**
     * Setups the database connection
     */
    setupDatabaseConnection()
    {
        // Creates the connection
        this.connection = mysql.createConnection({
            host     : this.options.database.host,
            user     : this.options.database.user,
            password : this.options.database.password,
            database : this.options.database.database,
        });

        // Connects to database
        this.connection.connect();
    }

    /**
     * Setups th exit handler (closes connections, etc...)
     */
    setupExitHandler()
    {
        process.stdin.resume(); //so the program will not close instantly

        function exitHandler(options, err) {
            if (options.cleanup) {
                if (this.connection) {
                    console.log('Closing database connection.');
                    this.connection.end();
                }
            }
            if (err) console.log(err.stack);
            if (options.exit) process.exit();
        }

        // Do something when app is closing
        process.on('exit', exitHandler.bind(this, { cleanup:true }));

        // Catches ctrl+c event
        process.on('SIGINT', exitHandler.bind(this, { cleanup: true, exit:true }));

        // Catches uncaught exceptions
        process.on('uncaughtException', exitHandler.bind(this, { exit:true }));
    }

    /**
     * Setups the web socket server
     */
    setupWebSocket()
    {
        // Creates the web socket server
        this.wss = new WebSocket.Server({
            port: 8099,
            origin: '*',
        });

        // Handles new connections
        this.wss.on('connection', (ws, req) => {
            console.log('New connection from ', req.connection.remoteAddress);

            // Implements a method to send an object
            ws.sendObject = (data) => {
                ws.send(JSON.stringify(data));
            };

            // Greetings
            ws.send('Hello, I am the server.');

            // On message receive
            ws.on('message', (message) => {
                console.log('Incoming request');
                this.handleMessage(message, ws);
                console.log('');
            });
        });
    }

    run()
    {
        // Starts the timeline
        try {
            this.startTimeline()
                .then(() => {
                    console.log('Timeline has started !');
                })
                .catch(() => {
                    throw 'Failed to start timeline !';
                })
            ;
        } catch (exception) {
            console.log('An exception occured: ', exception);

            // Re-run with a little delay to prevent spamming
            console.log('Re-running in 3 seconds...');
            setTimeout(() => {
                this.run();
            }, 3000);
        }
    }

    /**
     * Broadcasts a message to all the connected clients
     *
     * @param message
     */
    broadcast(message)
    {
        let wss = this.getWebSocketServer();

        // Broadcast to every client
        console.log('Broadcasting to ' + wss.clients.size + ' client(s)');
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                console.log('Sending to client ', client._socket.remoteAddress);
                client.sendObject(message);
            }
        });

        console.log('End of broadcast');
        console.log('');
    }

    /**
     * Starts the scenario timeline
     *
     * @returns {Promise}
     */
    startTimeline()
    {
        console.log('Starting timeline...')
        return this.nextScenario();
    }

    /**
     * Runs the next scenario
     *
     * @returns {Promise}
     */
    nextScenario(id)
    {
        // Requests a new scenario
        return this.requestNewScenario(id)

            .then((scenario) => {

                // Broadcasts the new scenario
                this.broadcast({
                    action: 'runScenario',
                    data: scenario,
                });

                // Runs the timer for the next scenario
                if (this.nextScenarioTimer) clearTimeout(this.nextScenarioTimer);
                this.nextScenarioTimer = setTimeout(() => {
                    this.nextScenario();
                }, scenario.timeout || this.options.scenarioTimeout);
            })

            .catch((e) => {
                console.log('Failed to request next scenario: ', e);
            })
        ;
    }

    /**
     * Gets the current scenario
     *
     * @returns {*}
     */
    getCurrentScenario()
    {
        return this.currentScenario;
    }

    /**
     * Sets the current scenario
     *
     * @param scenario
     */
    setCurrentScenario(scenario)
    {
        this.currentScenario = scenario;
        console.log('Current scenario: ', scenario);
    }

    /**
     * Requests a new scenario to display
     *
     * @returns {Promise}
     */
    requestNewScenario(id)
    {
        return new Promise((resolve, reject) => {

            // Builds the query
            let query;
            if (id) {
                query = 'SELECT * FROM scenarios WHERE id = '+parseInt(id, 10)+' LIMIT 1';
            } else {
                // @todo algorithm
                // On prends le scénario le plus haut en priorité, dans l'interval de temps programmé (date de début,
                // date de fin, jours de la semaine, plage horaire). Si plusieurs scénarios qui match, on prends celui
                // avec le nombre d'affichage le plus bas et la date de création la plus ancienne.

                // Gets the scenario with the highest priority, in the scheduled time interval (start date,
                // end date, days of the week, time slot), with the lowest display number and the earliest creation date.
                // @todo date de création la plus ancienne.
                query = `
                    SELECT * 
                    FROM scenarios AS s1 
                    WHERE priority = ( 
                      SELECT MAX(priority)
                      FROM scenarios AS s2 
                      WHERE (date_start IS NULL OR date_start <= NOW())
                      AND (date_end IS NULL OR date_end >= NOW())
                      AND (display_limit IS NULL OR display_count < display_limit)
                    ) 
                    ORDER BY display_count ASC, RAND()
                    LIMIT 1
                `;
            }

            // Executes the query
            this.connection.query(query, (error, results, fields) => {

                // Error
                if (error) {
                    reject();
                    throw error;
                }

                // Success
                else {

                    if (results.length === 0) {
                        console.log('No scenario found !');
                        return ;
                    }

                    // Builds the scenario
                    let scenario = this.buildScenarioFromRecord(results[0]);

                    // Sets as the current one
                    this.setCurrentScenario(scenario);

                    // Sets the scenario's last display date and increment display counter
                    this.connection.query(`
                        UPDATE scenarios
                        SET display_date_last = NOW(),
                        display_count = display_count + 1
                        WHERE id = ?
                    `, [scenario.id], function (error, results, fields) {
                        if (error) throw error;
                    });

                    resolve(scenario);
                }
            });
        });
    }

    /**
     * Handles an incoming message
     *
     * @param message
     * @param ws
     */
    handleMessage(message, ws)
    {
        // Tries parsing the message as JSON
        try {
            let messageObject = JSON.parse(message);
            if (typeof messageObject === 'object') {
                message = messageObject;
            }
        } catch (e) {
            this.debug(e);
        }

        // Checks format of message
        if (typeof message !== 'object') {
            console.warn('Invalid request format');
            return;
        }

        // Checks the token
        if (message.token !== this.options.requestToken) {
            console.warn('Invalid token: ', message.token); // @todo should we really print the invalid token ?
            return;
        }

        let data = message.data;
        this.debug(data);

        // Checks if action is specified
        if (typeof data.action === 'undefined') {
            console.warn('No action specified');
            return;
        }

        // Handles actions
        switch (data.action) {

            // Runs the current scenario
            case 'runNextScenario':
                this.nextScenario(data.id);
                break;

            // Gets the current scenario
            case 'getCurrentScenario':
                ws.sendObject({
                    action: 'runScenario',
                    data: this.getCurrentScenario(),
                });
                break;
        }
    }

    getWebSocketServer()
    {
        if (!this.wss) {
            throw 'WebSocket server not running.';
        }

        return this.wss;
    }

    getOptions()
    {
        return this.options;
    }

    /**
     * Builds the scenario from the given record
     *
     * @param record
     * @returns {{title, handler: *, handlerOptions: {}}}
     */
    buildScenarioFromRecord(record)
    {
        let scenario = {
            id: record.id,
            title: record.name,
            handler: record.handler,
            handlerOptions: JSON.parse(record.handler_options) || {},
        };

        // Specific parsing per handler
        switch (scenario.handler) {
            case 'message':
                // Compiles the message with the template
                let template = fs.readFileSync('views/message.html').toString();
                template = template.replace('{{message}}', scenario.handlerOptions.message);
                scenario.handlerOptions.content = template;
                break;

        }

        return scenario;
    }

    debug(data)
    {
        console.log('[DEBUG] ', data);
    }
}

module.exports = Server;
