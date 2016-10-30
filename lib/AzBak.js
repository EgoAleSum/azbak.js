'use strict';

const _ = require('lodash')
const fs = require('fs')

const StreamUpload = require('./StreamUpload')

module.exports = () => {
    // Check if we're passed an input file, otherwise read from stdin
    let sourceStream = process.stdin

    // Check if we're passed a file name; use stdin if filename is "-"
    if(process.argv && _.isArray(process.argv)) {
        let filename = process.argv[2]
        if(filename && _.isString(filename) && filename != '-') {
            if(!fs.existsSync(filename)) {
                throw Error('File does not exist: ' + filename)
            }

            // Open a stream in read mode
            sourceStream = fs.createReadStream(filename)
        }
    }

    // Test upload
    let upload = new StreamUpload(sourceStream, '/bak1/test-'+(Date.now() / 1000 | 0)+'.jpg')
    upload.upload()
    /*upload.init()
        .then((response, body) => {
            console.log('ok', response.statusCode, response.body)
        })
        .catch((error) => {
            console.log('Request failed', error)
        })*/
}