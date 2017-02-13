'use strict'

const crypto = require('crypto')
const request = require('requestretry')
const StreamChunkify = require('stream-chunkify')
const through2Concurrent = require('through2-concurrent')
const Authorization = require('./Authorization')
const Utils = require('./Utils')

/**
 * Uploads a stream to Azure Blob Storage.
 * 
 * Azure Blob Storage can support up to 50,000 blocks of up to 100MB each,
 * for a total size of approximately ~4.8TB per blob (we're using block blobs).
 * For files larger than 4.8TB, multiple blobs are created, with names .000, .001, .002, etc.
 */
class StreamUpload {
    /**
     * Constructor: initialize a StreamUpload object.
     *
     * @param {Object} sourceStream - Stream containing the data to be sent
     * @param {string} blob - Name of the blob (starting with /)
     * @param {Object} authData - Authentication data
     * @param {string} authData.storageAccountName - Name of the Azure Storage Account (required)
     * @param {string} authData.storageAccountKey - Key of the Azure Storage Account (required if `storageAccountSasToken` is not set)
     * @param {string} authData.storageAccountSasToken - SAS token (required if `storageAccountKey` is not set)
     */
    constructor(sourceStream, blob, authData) {
        // Validate blob parameter
        if(!blob || typeof blob != 'string' || !blob.match(/\/(\$root|[a-z0-9](([a-z0-9\-])){1,61}[a-z0-9])\/(.*){1,1024}/)) {
            throw Error('Parameter blob must be a valid resource name for a blob in Azure Blob Storage')
        }

        // Store source stream and blob name in the object
        this._sourceStream = sourceStream
        this._blob = blob

        // Store authentication data
        if(!authData
            || !authData.storageAccountName
            || !authData.storageAccountName.match(/^[a-z0-9]{3,24}$/)) {
            throw Error('Storage account name is empty or not valid')
        }

        let hasValidStorageAccountKey = !!(authData.storageAccountKey
            && authData.storageAccountKey.match(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/))
        let hasValidStorageAccountSasToken = !!(authData.storageAccountSasToken
            && authData.storageAccountSasToken.match(/^(\?|&)?(\w+(=[\w-%:]*)?(&\w+(=[\w-%:]*)?)*)?$/))
        if( (!hasValidStorageAccountKey && !hasValidStorageAccountSasToken)
            || (hasValidStorageAccountKey && hasValidStorageAccountSasToken)) {
            throw Error('Either one of storage account key or SAS token must be set and valid')
        }

        this._authData = authData

        // Set default values for properties
        this._blockSize = StreamUpload.defaultBlockSize
        this._blocksPerBlob = StreamUpload.maxBlocksPerBlob
        this._concurrency = StreamUpload.defaultConcurrency
        this._md5 = true
        this._singleBlob = false
        this._endpoint = StreamUpload.defaultEndpoint
    }

    /**
     * Base URL for the blob.
     *
     * This is a read-only value.
     * 
     * @type {string}
     */
    get blobUrl() {
        return 'https://' + this._authData.storageAccountName + '.' + this.endpoint + this._blob
    }

    /**
     * Size of each block uploaded, in bytes.
     *
     * The maximum size imposed by Azure Blob Storage is 100MB; by default, we are using
     * a smaller block size to reduce memory footprint.
     * 
     * Note that the maximum number of blocks per blob remain 50,000, regardless of the size
     * of each block.
     *
     * @type {number}
     */
    get blockSize() {
        return this._blockSize
    }
    set blockSize(val) {
        val = val | 0
        if(val > StreamUpload.maxBlockSize) {
            throw Error('Maximum block size is ' + StreamUpload.maxBlockSize)
        }
        if(val < 1) {
            throw Error('Block size must be a positive integer')
        }
        this._blockSize = val
    }

    /**
     * Number of blocks in each blob. Each block is at most 100MB in size.
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
        if(val < 1) {
            throw Error('Number of blocks per blob must be a positive integer')
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
     * Do not append a suffix to the file name. This will ensure that for files or streams
     * that can fit one blob, no ".000" suffix is added. However, uploads of larger files
     * will fail.
     * This is disabled by default.
     *
     * @type {boolean}
     */
    get singleBlob() {
        return this._singleBlob
    }
    set singleBlob(val) {
        this._singleBlob = !!val
    }

    /**
     * Set what endpoint to use for Azure Blob Storage.
     *
     * The default value is 'blob.core.windows.net' (Azure Global).
     * Other options you might want to leverage:
     * - Azure China: 'blob.core.chinacloudapi.cn'
     * - Azure Germany: 'blob.core.cloudapi.de'
     * 
     * For Azure Stack, use your custom endpoint.
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

                    // If we have a single blob, we can't upload more than 1 sequence
                    if(this.singleBlob && seqNum > 0) {
                        return reject(new Error('singleBlob option is set, but stream is too big to fit one blob'))
                    }

                    // Get the sequence and block ids
                    let seqId = ( this.singleBlob ? '' : '.' + Utils.zeroPad(seqNum, 3) )
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
                .pipe(StreamChunkify(this.blockSize))
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
                let seqId = ( this.singleBlob ? '' : '.' + Utils.zeroPad(i, 3) )

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
     * @param {string} [seqId] - Optional suffix for the blob name (for storing files bigger than 4.8TB)
     * @return {Promise} Promise containing the result of the operation 
     */
    commitBlockBlob(blockCount, seqId) {
        seqId = seqId || ''

        //DebugLog('Commiting seq ' + seqId + ' with ' + blockCount + ' blocks')

        // Authorization header
        let qsArgs = {
            'comp': 'blocklist'
        }
        let auth = new Authorization('PUT', this._blob  + seqId, {
            contentType: 'application/octet-stream',
            qs: qsArgs
        })
        auth.setStorageAccount(this._authData.storageAccountName, this._authData.storageAccountKey, this._authData.storageAccountSasToken)

        // List of blocks as XML
        let xmlData = '<?xml version="1.0" encoding="utf-8"?><BlockList>'
        for(let i = 0; i < blockCount; i++) {
            xmlData += '<Latest>' + this.generateBlockId(i) + '</Latest>'
        }
        xmlData += '</BlockList>'

        // Request, and return the response
        return request({
            method: 'PUT',
            url: this.blobUrl + seqId,
            qs: auth.querystring(),
            body: xmlData,
            headers: auth.requestHeaders(),

            // Configuration for request-retry
            fullResponse: true,
            maxAttempts: 3,
            retryStrategy: StreamUpload.requestRetryStrategy
        })
        .then((response) =>  {
            // If the status code is not 2xx, raise an error
            if(response.statusCode && (response.statusCode < 200 || response.statusCode > 300)) {
                throw Error('Request error (' + response.statusCode + '): ' + response.statusMessage)
            }
            
            // Add the "blobUrl" parameter to the response object
            response.blobUrl = this.blobUrl + seqId
            
            // Pass response down the chain
            return response
        })
    }

    /**
     * Upload a block of data to the block blob in Azure Blob Storage
     * 
     * @param {Buffer} block - Block of data to upload (maximum 100MB in size)
     * @param {String} blockId - ID of the block
     * @param {string} [seqId] - Optional suffix for the blob name (for storing files bigger than 4.8TB)
     * @return {Promise} Promise containing the result of the operation
     */
    putBlock(block, blockId, seqId) {
        seqId = seqId || ''

        // Validation
        if(typeof block != 'object' || !Buffer.isBuffer(block)) {
            reject(new Error('Parameter block must be a Buffer'))
            return
        }
        if(block.length > StreamUpload.blockSize) {
            reject(new Error('Block is larger than maximum allowed size of ' + StreamUpload.maxBlockSize + ' bytes'))
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
        auth.setStorageAccount(this._authData.storageAccountName, this._authData.storageAccountKey, this._authData.storageAccountSasToken)

        // Request
        let requestQs = auth.querystring()
        requestQs['comp'] = 'block'
        requestQs['blockid'] = blockId
        return request({
            method: 'PUT',
            url: this.blobUrl + seqId,
            qs: requestQs,
            body: block,
            headers: auth.requestHeaders(),

            // Configuration for request-retry
            fullResponse: true,
            maxAttempts: 3,
            retryStrategy: StreamUpload.requestRetryStrategy
        })
        .then((response) =>  {
            // If the status code is not 2xx, raise an error
            if(response.statusCode && (response.statusCode < 200 || response.statusCode > 300)) {
                throw Error('Request error (' + response.statusCode + '): ' + response.statusMessage)
            }

            // Add the "blobUrl" parameter to the response object
            response.blobUrl = this.blobUrl + seqId
            
            // Pass response down the chain
            return response
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

// Blocks in Azure Blob Storage are at most 100MB in size, but by default we're
// using 20MB blocks to reduce memory footprint. This can be altered by users.
// Value is in bytes
StreamUpload.defaultBlockSize = 20 * 1024 * 1024
StreamUpload.maxBlockSize = 100 * 1024 * 1024

// Each block blob in Azure Blob Storage can have up to 50,000 blocks
StreamUpload.maxBlocksPerBlob = 50000

// Maximum concurrent operations
StreamUpload.defaultConcurrency = 3

// Default endpoint for requests to Azure Blob Storage
StreamUpload.defaultEndpoint = 'blob.core.windows.net'

// Retry strategy for request-retry
StreamUpload.requestRetryStrategy = (error, response, body) => {
    // Always retry for any error
    if(error) {
        return true
    }

    // Expect a 2xx status code
    // Do not retry on 4xx errors, which are generally unrecoverable
    // Retry on 5xx server errors
    if(response.statusCode >= 500 && response.statusCode < 600) {
        return true
    }

    return false
}

module.exports = StreamUpload
