'use strict';

const _ = require('lodash')
const fs = require('fs')

const StreamUpload = require('./StreamUpload')

module.exports = () => {
    // Check if we're passed an input file, otherwise read from stdin
    let sourceFile = false

    // Check if we're passed a file name; use stdin if filename is "-"
    if(process.argv && _.isArray(process.argv) && process.argv[2] && _.isString(process.argv[2]) && process.argv[2] != '-') {
        sourceFile = process.argv[2]

        if(!fs.existsSync(sourceFile)) {
            throw Error('File does not exist: ' + sourceFile)
        }
    }

    console.log('Source', sourceFile)

    // Test upload
    let upload = new StreamUpload(sourceFile, '/bak1/test-'+(Date.now() / 1000 | 0)+'.jpg')
    upload.init()
        .then((response, body) => {
            console.log('ok', response.statusCode, response.body)
        })
        .catch((error) => {
            console.log('Request failed', error)
        })
}