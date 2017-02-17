'use strict'

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
        // eslint-disable-next-line
        return Object.keys(obj).sort().reduce((r, k) => (r[k] = obj[k], r), {})
    },

    /**
     * Zero-pad a number so it reaches the desired length
     * 
     * @param {number} num - Number to pad
     * @param {number} [length=3] - Desired length of the string
     * @return {string} Number with leading zeroes 
     */
    zeroPad: (num, length) => {
        length = length || 3

        let str = num + ''
        let pad = '0'.repeat(length - str.length)

        return pad + str
    }
}
