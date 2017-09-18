const RequestCurrentScenario = require('../src/commands/RequestCurrentScenario.js');
const Reset = require('../src/commands/admin/Reset.js');
const RunScenario = require('../src/commands/admin/RunScenario.js');
const RunRandomScenario = require('../src/commands/admin/RunRandomScenario.js');
const CreateScenario = require('../src/commands/admin/CreateScenario.js');

module.exports = {
    public: {
        'requestCurrentScenario': RequestCurrentScenario,
    },
    admin: {
        'reset': Reset,
        'runScenario': RunScenario,
        'runRandomScenario': RunRandomScenario,
        'createScenario': CreateScenario,
    },
};
