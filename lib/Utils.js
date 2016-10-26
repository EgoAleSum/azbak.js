'use strict';

module.exports = {
    /**
     * Sort an object by key.
     * 
     * Source: http://stackoverflow.com/a/29622653/192024
     * 
     * @param {Object} obj - Object to sort
     * @return {Object} Object whose properties are sorted by key
     */
    sortObject: (obj) => {
        return Object.keys(obj).sort().reduce((r, k) => (r[k] = obj[k], r), {})
    }
}