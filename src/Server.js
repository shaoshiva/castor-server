"use strict";

const fs            = require('fs');
const WebSocket     = require('ws');
const mysql         = require('mysql');
const express       = require('express');
const commands      = require('../config/commands.js');
const path          = require('path');

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
                host: 'localhost',
                user: 'root',
                password: '',
                database: 'server',
            },
            websocket: {
                port: 8099,
                origin: '*',
            },
            http: {
                port: 1337,
            },
            commands: {},
        }, options || {});

        this.setupDatabaseConnection();

        this.setupExitHandler();

        this.setupWebSocket();

        this.setupWebServer();
    }

    /**
     * Returns the default commands
     *
     * @returns {*}
     */
    static get defaultCommands()
    {
        return commands;
    }

    /**
     * Gets the options
     *
     * @returns {*}
     */
    getOptions()
    {
        return this.options;
    }

    /**
     * Setups the web server (admin interface)
     */
    setupWebServer()
    {
        /**
         * HTTP server
         */
        this.http = express();
        this.http.set('port', this.options.http.port);
        this.http.listen(this.options.http.port);

        var router = express.Router();
        var viewsPath = path.join(__dirname+'/../views/admin/');

        // Registers a middleware to log the requests
        router.use(function (request, response, next) {
            console.log('HTTP request: '+request.method+' '+request.url);
            next();
        });

        // Admin homepage
        router.get('/',function(request, response){
            response.sendFile(path.join(viewsPath+'index.html'));
        });

        this.http.use('/', router);

        // 404
        this.http.use('*', function(request, response){
            response.sendFile(path.join(viewsPath+'404.html'));
        });
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
        this.wss = new WebSocket.Server(this.options.websocket);

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
                console.log('Incoming message.');
                this.handleMessage(message, ws);
                console.log('');
            });
        });
    }

    /**
     * Gets the websocket server instance
     *
     * @returns {WebSocket.Server|*}
     */
    getWebSocketServer()
    {
        if (!this.wss) {
            throw 'WebSocket server not running.';
        }

        return this.wss;
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

    /**
     * Runs the server
     */
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
     * Broadcasts the given scenario
     *
     * @param scenario
     */
    broadcastScenario(scenario)
    {
        this.broadcast({
            command: 'runScenario',
            params: {
                scenario,
            },
        });
    }

    /**
     * Runs the next scenario in timeline
     *
     * @param {Promise} promise
     * @returns {Promise}
     */
    runNextScenario(promise)
    {
        return promise
            .then((scenario) => {
                // Displays the scenario
                this.displayScenario(scenario);

                // Schedules the next scenario
                this.scheduleNextScenario(scenario.display_timeout);
            })
            .catch((exception) => {
                console.log('Failed to request a new scenario: ', exception);

                // Schedules the next scenario
                this.scheduleNextScenario();
            })
        ;
    }

    /**
     * Schedule the next scenario with the given delay
     *
     * @param delay
     */
    scheduleNextScenario(delay)
    {
        // Clears the previous timer for the next scenario
        if (this.nextScenarioTimer) {
            clearTimeout(this.nextScenarioTimer);
        }

        // Runs a new timer for the next scenario
        this.nextScenarioTimer = setTimeout(() => {
            this.runNextScenario(this.requestRandomScenario());
        }, delay || this.options.scenarioTimeout);
    }

    /**
     * Creates a new scenario
     *
     * @param scenario
     * @returns {Promise}
     */
    createRecordFromScenario(scenario)
    {
        return new Promise((resolve, reject) => {

            // Builds the record
            let record = this.buildRecordFromScenario(scenario);

            // Inserts the record
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
     * Builds a record from the given scenario
     *
     * @param scenario
     * @returns {object}
     */
    buildRecordFromScenario(scenario)
    {
        // Converts handler options to JSON
        let handler_options = scenario.handler_options || {};
        if (typeof handler_options === 'object') {
            handler_options = JSON.stringify(handler_options);
        }

        // Builds the record
        let record = {
            handler: scenario.handler,
            handler_options: handler_options,
            priority: parseInt(scenario.priority, 10) || 0,
            date_start: scenario.date_start || null,
            date_end: scenario.date_end || null,
            week_days: scenario.week_days || null,
            hour_start: scenario.hour_start || null,
            hour_end: scenario.hour_end || null,
            display_limit: scenario.display_limit || null,
        };

        return record;
    }

    /**
     * Builds a scenario from the given record
     *
     * @param record
     * @returns {object}
     */
    buildScenarioFromRecord(record)
    {
        let scenario = Object.assign({}, record, {
            name: record.name,
            handler: record.handler,
            handler_options: JSON.parse(record.handler_options) || {},
        });

        // Specific parsing per handler
        switch (scenario.handler) {
            case 'message':
                // Compiles the message with the template
                let template = fs.readFileSync(__dirname+'/../views/message.html').toString();
                template = template.replace('{{message}}', scenario.handler_options.message || '');

                // Compiles the media (image or video)
                let video = '';
                let image = '';
                if (scenario.handler_options.video) {
                    video = '<video class="media video" autoplay loop class="video"><source type="video/mp4" src="'+scenario.handler_options.video+'"></video>';
                } else if (scenario.handler_options.image) {
                    image = '<img class="media image" src="'+scenario.handler_options.image+'" alt=""/>';
                }
                template = template.replace('{{image}}', image);
                template = template.replace('{{video}}', video);

                scenario.handler_options.content = template;
                break;

        }

        return scenario;
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
    requestRandomScenario()
    {
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
            WHERE (date_start IS NULL OR date_start <= NOW())
            AND (date_end IS NULL OR date_end >= NOW())
            AND (display_limit IS NULL OR display_count < display_limit)
            ORDER BY priority DESC, RAND()
            LIMIT 1
        `);
    }

    /**
     * Gets a scenario by query
     *
     * @param query
     * @param data
     * @returns {Promise}
     */
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

    debug(data)
    {
        console.log('[DEBUG] ', data);
    }
}

module.exports = Server;
