'use strict'

const crypto = require('crypto')
const _ = require('lodash')
const request = require('request')
const StreamChunkify = require('stream-chunkify')
const through2Concurrent = require('through2-concurrent')
const Authorization = require('./Authorization')
const Utils = require('./Utils')

/**
 * Uploads a stream to Azure Blob Storage.
 * 
 * Azure Blob Storage can support up to 50,000 blocks of 4MB each,
 * for a total size of approximately 195GB per blob (we're using block blobs).
 * For files larger than 195GB, multiple blobs are created, with names .000, .001, .002, etc
 */
class StreamUpload {
    /**
     * Constructor: initialize a StreamUpload object.
     *
     * @param {Object} sourceStream - Stream containing the data to be sent
     * @param {string} blob - Name of the blob (starting with /)
     * @param {string} storageAccountName - Name of the Azure Storage Account
     * @param {string} storageAccountKey - Key of the Azure Storage Account
     */
    constructor(sourceStream, blob, storageAccountName, storageAccountKey) {
        // Validate blob parameter
        if(!blob || !_.isString(blob) || !blob.startsWith('/')) {
            throw Error('Parameter blob must be a string starting with /')
        }

        // Store source stream and blob name in the object
        this._sourceStream = sourceStream
        this._blob = blob

        if(storageAccountName && storageAccountKey) {
            this._storageAccountName = storageAccountName
            this._storageAccountKey = storageAccountKey
        }
        else {
            throw Error('Storage account name and key not set')
        }

        // Set default values for properties
        this._blocksPerBlob = StreamUpload.maxBlocksPerBlob
        this._concurrency = StreamUpload.defaultConcurrency
        this._md5 = true
        this._endpoint = StreamUpload.defaultEndpoint

        // Blob url
        this._blobUrl = 'https://' + this._storageAccountName + '.' + this.endpoint + blob
    }

    /**
     * Number of blocks in each blob. Each block is at most 4MB in size.
     *
     * When using smaller values, you will potentially have a bigger number separate
     * blobs inside your Azure Storage Account. Because performance targets are applied at
     * each individual blob, retrieving data might be faster if you have more blobs, as
     * you can download them in parallel. This has no effect on upload speed.
     *
     * The maximum value is 50,000, as imposed by Azure Blob Storage.
     *
     * @type {number}
     */
    get blocksPerBlob() {
        return this._blocksPerBlob
    }
    set blocksPerBlob(val) {
        val = val | 0
        if(val > StreamUpload.maxBlocksPerBlob) {
            throw Error('Maximum number of blocks per blob is ' + StreamUpload.maxBlocksPerBlob)
        }
        this._blocksPerBlob = val
    }

    /**
     * Number of parallel upload tasks.
     *
     * Please note that the higher the number of parallel uploads, the more memory is required.
     *
     * @type {number}
     */
    get concurrency() {
        return this._concurrency
    }
    set concurrency(val) {
        val = val | 0
        if(val < 1) {
            throw Error('Concurrency must be a positive integer')
        }
        this._concurrency = val
    }

    /**
     * Calculate MD5 of blocks before uploading them, to ensure integrity during transfer.
     * This is enabled by default.
     *
     * @type {boolean}
     */
    get md5() {
        return this._md5
    }
    set md5(val) {
        this._md5 = !!val
    }

    /**
     * Set what endpoint to use for Azure Blob Storage.
     *
     * The default value is 'blob.core.windows.net' (Azure Global).
     * Other options you might want to leverage:
     * - Azure China: 'blob.core.chinacloudapi.cn'
     * - Azure Germany: 'blob.core.cloudapi.de'
     *
     * @type {string}
     */
    get endpoint() {
        return this._endpoint
    }
    set endpoint(val) {
        val = val + ''
        if(!val) {
            throw Error('Endpoint is empty')
        }
        this._endpoint = val
    }

    /**
     * Start upload of the stream
     * @return {Promise} Promise containing the result of the upload
     */
    upload() {
        // First step: commit all blocks
        return new Promise((resolve, reject) => {
            let chunkCount = 0

            // Transform function for the pipe
            const transformFunction = through2Concurrent(
                // Options
                {
                  maxConcurrency: this.concurrency
                },
                // Transform function
                (chunk, enc, callback) => {
                    // Get sequence number and number of block in the sequence
                    let seqNum = Math.trunc(chunkCount /  this.blocksPerBlob)
                    let blockNum = chunkCount % this.blocksPerBlob
                    chunkCount++

                    // Get the sequence and block ids
                    let seqId = '.' + Utils.zeroPad(seqNum, 3)
                    let blockId = this.generateBlockId(blockNum)

                    //DebugLog('(Seq ' + seqId + ') Starting upload of block ' + blockNum + ', length ' + chunk.length + ', blockId ' + blockId)

                    this.putBlock(chunk, blockId, seqId)
                        .then((response) => {
                            //DebugLog('(Seq ' + seqId + ') Finished upload of chunk ' + blockNum  + ', blockId ' + blockId, response.body)
                            callback()
                        })
                        .catch((error) => {
                            reject(error)
                        })
                },
                // Flush function
                (callback) => {
                    // Resolve the promise at the end, returning the number of chunks uploaded
                    resolve(chunkCount)
                }
            )

            this._sourceStream
                .pipe(StreamChunkify(StreamUpload.blockSize))
                .pipe(transformFunction)
        })
        // Second step: commit the blobs by sending the list
        .then((chunkCount) => {
            //DebugLog('Uploaded total: ' + chunkCount)

            // Promises to return
            let requests = []

            // Count how many parts (sequences) we have
            let seqFull = !(chunkCount % this.blocksPerBlob)
            let seqCount = Math.trunc(chunkCount /  this.blocksPerBlob) + (seqFull ? 0 : 1)

            // Commit each part/sequence
            for(let i = 0; i < seqCount; i++) {
                let seqId = '.' + Utils.zeroPad(i, 3)

                // Unless this is the last sequence, we will always have blocksPerBlob blocks
                let blocksInSeq = (i === (seqCount - 1) && !seqFull)
                    ? (chunkCount % this.blocksPerBlob)
                    : this.blocksPerBlob

                requests.push(this.commitBlockBlob(blocksInSeq, seqId))
            }

            return Promise.all(requests)
        })
        .then((requests) => {
            // Gather all URLs
            return requests.map((value) => {
                return value.blobUrl
            })
        })
    }

    /**
     * Commit a block blob into Azure Blob Storage by sending the list of blocks.
     *
     * @param {number} blockCount - Number of blocks uploaded. This will be used to re-generate the block ids
     * @param {string} [seqId] - Optional suffix for the blob name (for storing files bigger than 195GB)
     * @return {Promise} Promise containing the result of the operation 
     */
    commitBlockBlob(blockCount, seqId) {
        seqId = seqId || ''

        //DebugLog('Commiting seq ' + seqId + ' with ' + blockCount + ' blocks')

        return new Promise((resolve, reject) => {
            // Authorization header
            let qsArgs = {
                'comp': 'blocklist'
            }
            let auth = new Authorization('PUT', this._blob  + seqId, {
                contentType: 'application/octet-stream',
                qs: qsArgs
            })
            auth.setStorageAccount(this._storageAccountName, this._storageAccountKey)

            // List of blocks as XML
            let xmlData = '<?xml version="1.0" encoding="utf-8"?><BlockList>'
            for(let i = 0; i < blockCount; i++) {
                xmlData += '<Latest>' + this.generateBlockId(i) + '</Latest>'
            }
            xmlData += '</BlockList>'

            // Request
            request({
                method: 'PUT',
                url: this._blobUrl + seqId,
                qs: qsArgs,
                body: xmlData,
                headers: auth.requestHeaders(),
                callback: (error, response, body) => {
                    if(error) {
                        reject(error)
                    }
                    else {
                        // Ensure we got a 201 status code
                        if(response.statusCode == 201) {
                            // Add the "blobUrl" parameter to the response object
                            response.blobUrl = this._blobUrl + seqId
                            resolve(response)
                        }
                        else {
                            reject('(' + response.statusCode + ') ' + response.statusMessage)
                        }
                    }
                }
            })
        })
    }

    /**
     * Upload a block of data to the block blob in Azure Blob Storage
     * 
     * @param {Buffer} block - Block of data to upload (maximum 4MB in size)
     * @param {String} blockId - ID of the block
     * @param {string} [seqId] - Optional suffix for the blob name (for storing files bigger than 195GB)
     * @return {Promise} Promise containing the result of the operation
     */
    putBlock(block, blockId, seqId) {
        seqId = seqId || ''

        return new Promise((resolve, reject) => {
            // Validation
            if(typeof block != 'object' || !Buffer.isBuffer(block)) {
                reject(new Error('Parameter block must be a Buffer'))
                return
            }
            if(block.length > StreamUpload.blockSize) {
                reject(new Error('Block is larger than maximum allowed size of ' + StreamUpload.blockSize + ' bytes'))
                return
            }

            // Calculate MD5
            let md5 = undefined
            if(this.md5) {
                md5 = crypto.createHash('md5').update(block).digest('base64')
            }

            // Authorization header
            let auth = new Authorization('PUT', this._blob  + seqId, {
                contentType: 'application/octet-stream',
                contentMD5: md5,
                qs: {
                    // We're using SharedKeyLite, so we don't include blockid here
                    'comp': 'block'
                }
            })
            auth.setStorageAccount(this._storageAccountName, this._storageAccountKey)

            // Request
            request({
                method: 'PUT',
                url: this._blobUrl + seqId,
                qs: {
                    'comp': 'block',
                    'blockid': blockId
                },
                body: block,
                headers: auth.requestHeaders(),
                callback: (error, response, body) => {
                    if(error) {
                        reject(error)
                    }
                    else {
                        // Ensure we got a 201 status code
                        if(response.statusCode == 201) {
                            // Add the "blobUrl" parameter to the response object
                            response.blobUrl = this._blobUrl + seqId
                            resolve(response)
                        }
                        else {
                            reject('(' + response.statusCode + ') ' + response.statusMessage)
                        }
                    }
                }
            })
        })
    }

    /**
     * Generate a block id. This implementation returns the number of the block with padding 0's in front, converted to base64
     *
     * @param {int} blockNum - Number of block
     * @return {string} Block id for use with Azure Blob Storage
     */
    generateBlockId(blockNum) {
        // Pad and convert to base64
        return Buffer
            .from(Utils.zeroPad(blockNum, 5), 'utf8')
            .toString('base64')
    }
}

// Blocks in Azure Blob Storage are at most 4MB in size; value is in bytes
StreamUpload.blockSize = 4 * 1024 * 1024

// Each block blob in Azure Blob Storage can have up to 50,000 blocks
StreamUpload.maxBlocksPerBlob = 50000

// Maximum concurrent operations
StreamUpload.defaultConcurrency = 3

// Default endpoint for requests to Azure Blob Storage
StreamUpload.defaultEndpoint = 'blob.core.windows.net'

module.exports = StreamUpload
