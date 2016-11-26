'use strict';

const _ = require('lodash')
const request = require('request')
const Authorization = require('./Authorization')
const StreamChunkify = require('stream-chunkify')
const through2Concurrent = require('through2-concurrent')

// Blocks in Azure Blob Storage are at most 4MB in size; value is in bytes
const blockSize = 4 * 1024 * 1024

// Each append blob in Azure Blob Storage can have up to 50,000 blocks
const blocksPerBlob = 50000

// Maximum concurrent operations
const maxConcurrency = 3

/**
 * Uploads a stream to Azure Blob Storage.
 * 
 * Azure Blob Storage can support up to 50,000 blocks of 4MB each,
 * for a total size of approximately 195GB per blob (we're using append blobs).
 * For files larger than 195GB, multiple blobs are created, with names .001, .002, etc
 */
class StreamUpload {
    /**
     * Constructor: initialize a StreamUpload object.
     * 
     * The storageAccountName and storageAccountKey parameters are optional, and if not set
     * their values are read from the environmental variables AZURE_STORAGE_ACCOUNT and
     * AZURE_STORAGE_ACCESS_KEY respectively. If you pass the storage account name as
     * parameter, you must pass the key as well.
     * 
     * @param {Object} sourceStream - Stream containing the data to be sent
     * @param {string} blob - Name of the blob (starting with /)
     * @param {string} [storageAccountName] - Name of the Azure Storage Account
     * @param {string} [storageAccountKey] - Key of the Azure Storage Account
     */
    constructor(sourceStream, blob, storageAccountName, storageAccountKey) {
        // Validate blob parameter
        if(!blob || !_.isString(blob) || !blob.startsWith('/')) {
            throw Error('Parameter blob must be a string starting with /')
        }

        // Store source stream and blob name in the object
        this._sourceStream = sourceStream
        this._blob = blob

        // Get account name and key from environmental variables by default:
        // AZURE_STORAGE_ACCOUNT
        // AZURE_STORAGE_ACCESS_KEY
        // (Same environmental variables used by the Azure CLI)
        this._storageAccountName = false
        this._storageAccountKey = false
        const env = process.env
        if(storageAccountName && storageAccountKey) {
            this._storageAccountName = storageAccountName
            this._storageAccountKey = storageAccountKey
        }
        else if(env && 
            (env.AZURE_STORAGE_ACCOUNT && _.isString(env.AZURE_STORAGE_ACCOUNT)) &&
            (env.AZURE_STORAGE_ACCESS_KEY && _.isString(env.AZURE_STORAGE_ACCESS_KEY))
        ) {
            this._storageAccountName = env.AZURE_STORAGE_ACCOUNT
            this._storageAccountKey = env.AZURE_STORAGE_ACCESS_KEY
        }
        else {
            throw Error('Storage account name and key not set. Pass them to the StreamUpload object or set the environmental variables AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY')
        }

        // Blob url
        this._blobUrl = 'https://' + this._storageAccountName + '.blob.core.windows.net' + blob
    }

    /**
     * Start upload of the stream
     * @return {Promise} Promise containing the result of the upload
     */
    upload() {
        return new Promise((resolve, reject) => {
            let num = 0
            this._sourceStream.pipe(StreamChunkify(blockSize))
                .pipe(through2Concurrent({maxConcurrency: maxConcurrency}, (chunk, enc, callback) => {
                    let numCp = num
                    num++
                    console.log('Starting upload of chunk ' + numCp)

                    this.appendBlock(chunk).then((response, body) => {
                        console.log('Finished upload of chunk ' + numCp, response.body)
                        callback()
                    })
                }))
        })
        /*this._sourceStream.pipe(through2((chunk, encoding, callback) => {
            console.log('Received bytes:', chunk.length)
            callback(null, chunk)
        }))
        .pipe(require('fs').createWriteStream('outtest.jpg'))*/

        // Pipe sourceStream into a transform stream that makes blocks all of the same size
        this._sourceStream.pipe(StreamChunkify(blockSize))
            .pipe(require('fs').createWriteStream('outtest.jpg'))
    }

    /**
     * Send a request to create an append blob to Azure Blob Storage
     * 
     * @param {string} [seq] - Optional suffix for the blob name (for storing files bigger than 195GB)
     * @return {Promise} Promise containing the result of the operation 
     */
    createAppendBlob(seq) {
        seq = seq || ''

        return new Promise((resolve, reject) => {
            let auth = new Authorization('PUT', this._blob  + seq, {contentType: 'application/octet-stream'})
            auth.setStorageAccount(this._storageAccountName, this._storageAccountKey)
            auth.addCustomHeader('x-ms-blob-type', 'AppendBlob')

            //console.log(auth.requestHeaders())

            request({
                method: 'PUT',
                url: this._blobUrl + seq,
                body: '', // To create an append blob, content must be empty
                headers: auth.requestHeaders(),
                callback: (error, response, body) => {
                    if(error) {
                        reject(error)
                    }
                    else {
                        resolve(response, body)
                    }
                }
            })
        })
    }

    /**
     * Upload a block of data to the append blob in Azure Blob Storage
     * 
     * @param {Buffer} block - Block of data to upload (maximum 4MB in size)
     * @param {string} [seq] - Optional suffix for the blob name (for storing files bigger than 195GB)
     * @return {Promise} Promise containing the result of the operation
     */
    appendBlock(block, seq) {
        seq = seq || ''

        return new Promise((resolve, reject) => {
            if(typeof block != 'object' || !Buffer.isBuffer(block)) {
                reject(new Error('Parameter block must be a Buffer'))
                return
            }
            if(block.length > blockSize) {
                reject(new Error('Block is larger than maximum allowed size of ' + blockSize + ' bytes'))
                return
            } 

            let auth = new Authorization('PUT', this._blob  + seq, {
                contentType: 'application/octet-stream',
                qs: {
                    'comp': 'appendblock'
                }
            })
            auth.setStorageAccount(this._storageAccountName, this._storageAccountKey)

            request({
                method: 'PUT',
                url: this._blobUrl + seq,
                qs: {
                    'comp': 'appendblock'
                },
                body: block,
                headers: auth.requestHeaders(),
                callback: (error, response, body) => {
                    if(error) {
                        reject(error)
                    }
                    else {
                        resolve(response, body)
                    }
                }
            })
        })
    }
}

module.exports = StreamUpload
