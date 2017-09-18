"use strict";

const fs            = require('fs');
const WebSocket     = require('ws');
const mysql         = require('mysql');

/**
 * The server
 */
class Server
{
    constructor(options)
    {
        // Default options
        this.options = Object.assign({
            requestToken: '',
            scenarioTimeout: 60000,
            database: {
                host     : 'localhost',
                user     : 'root',
                password : '',
                database : 'server',
            },
            commands: {
                public: {},
                admin: {},
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
            ws.sendPayload = (payload) => {
                ws.send(JSON.stringify({
                    time: Date.now(),
                    payload,
                }));
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
     * Starts the scenario timeline
     *
     * @returns {Promise}
     */
    startTimeline()
    {
        console.log('Starting timeline...');

        // Requests a random scenario
        return this.runNextScenario(this.requestRandomScenario());
    }

    /**
     * Runs the next scenario in timeline
     *
     * @returns {Promise}
     */
    runNextScenario(promise)
    {
        return promise
            .then((scenario) => {

                // Displays the scenario
                this.displayScenario(scenario);

                // Schedules the next scenario
                this.scheduleNextScenario(scenario.timeout);
            })
            .catch((exception) => {
                console.log('Failed to request a new scenario: ', exception);

                // Schedules the next scenario
                this.scheduleNextScenario();
            })
        ;
    }

    /**
     * Broadcasts a payload to all the connected clients
     *
     * @param payload
     */
    broadcast(payload)
    {
        let wss = this.getWebSocketServer();

        // Broadcast to every client
        console.log('Broadcasting to ' + wss.clients.size + ' client(s)');
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                console.log('Sending to client ', client._socket.remoteAddress);
                client.sendPayload(payload);
            }
        });

        console.log('End of broadcast');
        console.log('');
    }

    broadcastScenario(scenario)
    {
        this.broadcast({
            command: 'runScenario',
            params: {
                scenario,
            },
        });
    }

    scheduleNextScenario(delay)
    {
        // Clears the previous timer for the next scenario
        if (this.nextScenarioTimer) {
            clearTimeout(this.nextScenarioTimer);
        }

        // Runs a new timer for the next scenario
        this.nextScenarioTimer = setTimeout(() => {
            this.runNewScenario();
        }, delay || this.options.scenarioTimeout);
    }

    createScenario(options)
    {
        return new Promise((resolve, reject) => {

            let record = {
                handler: options.handler,
                handler_options: JSON.stringify(options.handler_options || options.handler_options || {}),
                priority: parseInt(options.priority, 10) || 0,
                date_start: options.date_start || null,
                date_end: options.date_end || null,
                week_days: options.week_days || null,
                hour_start: options.hour_start || null,
                hour_end: options.hour_end || null,
                display_limit: options.display_limit || null,
            };

            console.log('record to insert', record);

            this.connection.query(`INSERT INTO scenarios SET ?`, record, (error, results, fields) => {
                console.log('insertion results ', results);

                if (error) {
                    reject();
                    throw error;
                }

                if (results.insertId) {
                    resolve(results.insertId);
                } else {
                    reject('Cannot find the newly created scenario (no inserted ID).');
                }
            });
        });
    }

    /**
     * Requests a scenario by ID
     *
     * @param id
     * @returns {Promise}
     */
    requestScenarioById(id)
    {
        return this.getScenarioByQuery('SELECT * FROM scenarios WHERE id = ? LIMIT 1', [parseInt(id, 10)]);
    }

    /**
     * Requests a random scenario
     *
     * @returns {*}
     */
    requestRandomScenario() {
        // Builds the query
        //
        // On prends le scénario le plus haut en priorité, dans l'interval de temps programmé (date de début,
        // date de fin, jours de la semaine, plage horaire). Si plusieurs scénarios qui match, on prends celui
        // avec le nombre d'affichage le plus bas et la date de création la plus ancienne.
        //
        // Gets the scenario with the highest priority, in the scheduled time interval (start date,
        // end date, days of the week, time slot), with the lowest display number and the earliest creation date.
        //
        // @todo date de création la plus ancienne.
        //
        return this.getScenarioByQuery(`
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
        `);
    }

    getScenarioByQuery(query, data)
    {
        return new Promise((resolve, reject) => {
            let processResult = (error, results, fields) => {
                // Error
                if (error) {
                    reject(error, results);
                }
                // No result
                else if (results.length === 0) {
                    resolve(null);
                }
                // Success
                else {
                    resolve(this.buildScenarioFromRecord(results[0]));
                }
            };
            // Executes the query
            if (typeof data !== 'undefined') {
                this.connection.query(query, data, processResult);
            } else {
                this.connection.query(query, processResult);
            }
        });
    }

    /**
     * Requests a new scenario to display
     *
     * @param id
     * @param options
     * @returns {Promise}
     */
    requestScenario(id, options)
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

                    // Merges the custom handler options
                    if (options) {
                        scenario = Object.assign(scenario, options);
                    }

                    resolve(scenario);
                }
            });
        });
    }

    /**
     * Displays the given scenario
     *
     * @param scenario
     */
    displayScenario(scenario)
    {
        console.log('Displaying a new scenario: ', scenario);

        // Sets as the current scenario
        this.setCurrentScenario(scenario);

        // Broadcasts to clients
        this.broadcastScenario(scenario);

        // Updates the scenario's last display date and display counter
        let query = `
            UPDATE scenarios
            SET display_date_last = NOW(),
            display_count = display_count + 1
            WHERE id = ?
        `;
        this.connection.query(query, [scenario.id], function (error, results, fields) {
            if (error) throw error;
        });
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
        this.previousScenario = this.currentScenario;
        this.currentScenario = scenario;
        console.log('Current scenario: ', scenario);
    }

    /**
     * Gets the previous scenario
     *
     * @returns {*|null}
     */
    getPreviousScenario()
    {
        return this.previousScenario || null;
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
            if (typeof message === 'string' && message[0] === '{') {
                const messageObject = JSON.parse(message);
                if (typeof messageObject === 'object') {
                    message = messageObject;
                }
            }
        } catch (e) {
            this.debug(e);
        }

        // Checks format of message
        if (typeof message !== 'object') {
            console.warn('Invalid request: object expected.');
            return;
        }

        // Checks the token
        if (message.token !== this.options.requestToken) {
            console.warn('Invalid request token.');
            return;
        }

        // Gets the payload
        let payload = message.payload;
        this.debug(payload);

        // Checks if a command is specified
        if (typeof payload.command !== 'string') {
            console.warn('Command not specified.');
            return;
        }

        // Public commands
        if (typeof this.options.commands.public[payload.command] !== 'undefined') {
            // Runs the command
            try {
                let command = new this.options.commands.public[payload.command](this, ws, payload.params || {});
                command.run();
            } catch (exception) {
                console.warn('Command error: ', exception);
            }
        }

        // Admin commands
        else if (typeof this.options.commands.admin[payload.command] !== 'undefined') {

            // @todo authentication (per token ? per IP ? passphrase ? user session ?)

            // Runs the command
            try {
                let command = new this.options.commands.admin[payload.command](this, ws, payload.params || {});
                command.run();
            } catch (exception) {
                console.warn('Command error: ', exception);
            }
        }

        // Unknown command
        else {
            console.warn('Unknown command: ', payload.command);
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
     * @returns {{title, handler: *, handler_options: {}}}
     */
    buildScenarioFromRecord(record)
    {
        let scenario = Object.assign({}, record, {
            title: record.name,
            handler: record.handler,
            handler_options: JSON.parse(record.handler_options) || {},
        });

        // Specific parsing per handler
        switch (scenario.handler) {
            case 'message':
                // Compiles the message with the template
                let template = fs.readFileSync('views/message.html').toString();
                template = template.replace('{{message}}', scenario.handler_options.message || '');
                template = template.replace('{{image}}', scenario.handler_options.image || '//:0');
                scenario.handler_options.content = template;
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
