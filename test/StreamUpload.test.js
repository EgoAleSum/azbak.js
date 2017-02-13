'use strict'

const assert = require('assert')
const fs = require('fs')
const TestUtils = require('./_TestUtils')

const StreamUpload = require('../lib/StreamUpload')

describe('StreamUpload', function() {
    let storageAccount = {
        name: null,
        key: null,
        sasToken: null
    }

    // Container name where data is stored
    let containerName = 'test-' + parseInt(Date.now() / 1000, 10)

    before('ensure credentials are passed', TestUtils.RequireAuth)
    before('get credentials', TestUtils.GetCredentials(storageAccount, containerName))

    // TODO:
    //after('remove test container')
    
    it('constructor', function() {
        // Get a readable stream
        let useStream = fs.createReadStream('./assets/unsplash1.jpg')

        let credentials = {
                storageAccountName: storageAccount.name,
                storageAccountKey: storageAccount.key
            }

        // Initialize object
        assert.doesNotThrow(() => {
            let upload = new StreamUpload(useStream, '/' + containerName + '/test.jpg', credentials)
        })

        // SAS Token
        assert.doesNotThrow(() => {
            let upload = new StreamUpload(useStream, '/' + containerName + '/test.jpg', credentials)
        })

        // Should accept anything as input
        assert.doesNotThrow(() => {
            let upload = new StreamUpload(null, '/' + containerName + '/test.jpg', credentials)
        })

        // Should not accept empty or invalid destination blobs
        assert.throws(() => {
            let upload = new StreamUpload(null, '', credentials)
        }, /blob/i)
        assert.throws(() => {
            let upload = new StreamUpload('/invalid/', '', credentials)
        }, /blob/i)

        // Requires authentication data
        assert.throws(() => {
            let upload = new StreamUpload(null, '/' + containerName + '/test.jpg', {
                // Name not set
                storageAccountName: '',
                storageAccountKey: storageAccount.key
            })
        }, /Storage account name/i)
        assert.throws(() => {
            let upload = new StreamUpload(null, '/' + containerName + '/test.jpg', {
                // No key or SAS token
                storageAccountName: storageAccount.name
            })
        }, /storage account key or SAS token/i)
        assert.throws(() => {
            let upload = new StreamUpload(null, '/' + containerName + '/test.jpg', {
                // Both key and SAS token
                storageAccountName: storageAccount.name,
                storageAccountKey: storageAccount.key,
                storageAccountSasToken: storageAccount.sasToken
            })
        }, /storage account key or SAS token/i)
    })

    it('blobUrl and endpoint', function() {
        // Initialize object
        let upload = new StreamUpload(null, '/testcontainer/test.jpg', {
            storageAccountName: storageAccount.name,
            storageAccountKey: storageAccount.key
        })

        // Check url
        assert.ok(upload.blobUrl.match(/^https\:\/\/(.*?)\/testcontainer\/test\.jpg$/))

        // Default endpoint
        assert.ok(upload.blobUrl.indexOf(StreamUpload.defaultEndpoint) >= 0)
        assert.equal(upload.endpoint, StreamUpload.defaultEndpoint)

        // Change endpoint
        upload.endpoint = 'blob.core.cloudapi.de'
        assert.equal(upload.endpoint, 'blob.core.cloudapi.de')
        assert.ok(upload.blobUrl.indexOf(upload.endpoint) >= 0)

        // Errors
        assert.throws(() => { upload.endpoint = '' }, /endpoint/i)
    })

    it('blockSize', function() {
        // Constants
        assert.ok(StreamUpload.defaultBlockSize)
        assert.ok(StreamUpload.maxBlockSize)

        // Initialize object
        let upload = new StreamUpload(null, '/' + containerName + '/test.jpg', {
            storageAccountName: storageAccount.name,
            storageAccountKey: storageAccount.key
        })

        // Default value
        assert.equal(upload.blockSize, StreamUpload.defaultBlockSize)

        // Setter test
        upload.blockSize = 10
        assert.equal(upload.blockSize, 10)

        // Errors
        assert.throws(() => { upload.blockSize = 0 }, /block size/i)
        assert.throws(() => { upload.blockSize = -10 }, /block size/i)
        assert.throws(() => { upload.blockSize = StreamUpload.maxBlockSize + 1 }, /block size/i)
        assert.throws(() => { upload.blockSize = 'c' }, /block size/i)
    })

    it('blocksPerBlob', function() {
        // Constants
        assert.ok(StreamUpload.maxBlocksPerBlob)

        // Initialize object
        let upload = new StreamUpload(null, '/' + containerName + '/test.jpg', {
            storageAccountName: storageAccount.name,
            storageAccountKey: storageAccount.key
        })

        // Default value
        assert.equal(upload.blocksPerBlob, StreamUpload.maxBlocksPerBlob)

        // Setter test
        upload.blocksPerBlob = 10
        assert.equal(upload.blocksPerBlob, 10)

        // Errors
        assert.throws(() => { upload.blocksPerBlob = 0 }, /blocks per blob/i)
        assert.throws(() => { upload.blocksPerBlob = -10 }, /blocks per blob/i)
        assert.throws(() => { upload.blocksPerBlob = StreamUpload.maxBlocksPerBlob + 1 }, /blocks per blob/i)
        assert.throws(() => { upload.blocksPerBlob = 'c' }, /blocks per blob/i)
    })

    it('concurrency', function() {
        // Constants
        assert.ok(StreamUpload.defaultConcurrency)

        // Initialize object
        let upload = new StreamUpload(null, '/' + containerName + '/test.jpg', {
            storageAccountName: storageAccount.name,
            storageAccountKey: storageAccount.key
        })

        // Default value
        assert.equal(upload.concurrency, StreamUpload.defaultConcurrency)

        // Setter test
        upload.concurrency = 10
        assert.equal(upload.concurrency, 10)

        // Errors
        assert.throws(() => { upload.concurrency = 0 }, /concurrency/i)
        assert.throws(() => { upload.concurrency = -10 }, /concurrency/i)
        assert.throws(() => { upload.concurrency = 'c' }, /concurrency/i)
    })
})