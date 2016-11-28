'use strict'

/**
 * Wrapper around console.log that emits debug info if process.env.DEBUG is true
 * @param {...*} args - Variable list of arguments to log
 */
global.DebugLog = () => {
    if(process.env.DEBUG) {
        console.log(Array.prototype.slice.call(arguments))
    }
}
