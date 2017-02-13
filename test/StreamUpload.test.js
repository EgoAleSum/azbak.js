'use strict'

const assert = require('assert')
const fs = require('fs')
const TestUtils = require('./_TestUtils')

const StreamUpload = require('../lib/StreamUpload')

describe('StreamUpload', function() {
    before(TestUtils.RequireAuth)
    
    it('constructor', function() {
        // Get a readable stream
        let useStream = fs.createReadStream('./assets/unsplash1.jpg')

        // Get credentials from env
        let storageAccountName = process.env.AZURE_STORAGE_ACCOUNT
        let storageAccountKey = process.env.AZURE_STORAGE_ACCESS_KEY

        // Initialize object
        assert.doesNotThrow(() => {
            let upload = new StreamUpload(useStream, '/bak1/test.jpg', {
                storageAccountName: storageAccountName,
                storageAccountKey: storageAccountKey
            })
        })

        // Should accept anything as input
        assert.doesNotThrow(() => {
            let upload = new StreamUpload(null, '/bak1/test.jpg', {
                storageAccountName: storageAccountName,
                storageAccountKey: storageAccountKey
            })
        })

        // Should not accept empty or invalid destination blobs
        assert.throws(() => {
            let upload = new StreamUpload(null, '', {
                storageAccountName: storageAccountName,
                storageAccountKey: storageAccountKey
            })
        }, /blob/i)
        assert.throws(() => {
            let upload = new StreamUpload('/invalid/', '', {
                storageAccountName: storageAccountName,
                storageAccountKey: storageAccountKey
            })
        }, /blob/i)

        // Requires authentication data
        assert.throws(() => {
            let upload = new StreamUpload(null, '/bak1/test.jpg', {
                storageAccountName: '',
                storageAccountKey: storageAccountKey
            })
        }, /Storage account name/i)
        assert.throws(() => {
            let upload = new StreamUpload(null, '/bak1/test.jpg', {
                storageAccountName: storageAccountName,
                storageAccountKey: storageAccountKey
            })
        }, /Storage account name/i)
    })
})