'use strict';

const _ = require('lodash')
const request = require('request')
const through2 = require('through2')
const Authorization = require('./Authorization')

/**
 * Uploads a stream to Azure Blob Storage.
 * 
 * Azure Blob Storage can support up to 50,000 chunks of 4MB each,
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
     * Initialize the upload, by sending a request to create an append blob
     * to Azure Blob Storage
     * 
     * @returns {Promise} Promise containing the result of the initialization 
     */
    init() {
        return new Promise((resolve, reject) => {
            let auth = new Authorization('PUT', this._blob, {contentType: 'application/octet-stream'})
            auth.setStorageAccount(this._storageAccountName, this._storageAccountKey)
            auth.addCustomHeader('x-ms-blob-type', 'AppendBlob')

            console.log(auth.requestHeaders())

            request({
                method: 'PUT',
                url: this._blobUrl,
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
}

module.exports = StreamUpload
