const { EventEmitter } = require('events');

class LogEmitter extends EventEmitter {}
const logEmitter = new LogEmitter();
logEmitter.setMaxListeners(100);

module.exports = { logEmitter };
