'use strict'

const crypto = require('crypto')
const _ = require('lodash')
const Utils = require('./Utils')
const qs = require('qs')

/**
 * Generate authorization tokens for the requests to Azure Blob Storage
 */
class Authorization {
    /**
     * Constructor
     * 
     * @param {string} verb - HTTP verb used (e.g. GET, PUT...)
     * @param {string} blob - Name of the blob accessed
     * @param {Object} [extra] - Optional, extra paramters
     * @param {string} extra.contentMD5 - Value for the Content-MD5 header (optional)
     * @param {string} extra.contentType - Value for the Content-Type header (optional)
     * @param {Object} extra.qs - Dictionary of values for the querystring to append to the URL (optional)
     */
    constructor(verb, blob, extra) {
        if (!blob || !_.isString(blob) || !blob.startsWith('/')) {
            throw Error('Parameter blob must be a string starting with /')
        }

        // Store parameters
        this._verb = verb
        this._blob = blob

        // Extra parameters (optional)
        this._contentType = undefined
        this._contentMD5 = undefined
        this._qs = {}
        if (extra && _.isObject(extra) && !_.isEmpty(extra)) {
            // Content-MD5 and Content-Type
            if (extra.contentMD5 && _.isString(extra.contentMD5)) {
                this._contentMD5 = extra.contentMD5
            }
            if (extra.contentType && _.isString(extra.contentType)) {
                this._contentType = extra.contentType
            }
            
            // Querystring
            if (extra.qs) {
                this._qs = extra.qs
                this._blob += '?' + qs.stringify(extra.qs)
            }
        }

        // Initialize the object to hold custom headers
        this._customHeaders = {}

        // Key type and version
        this._keyType = 'SharedKeyLite'
        this._apiVersion = '2016-05-31'
        
        // Generate the x-ms-date header
        this._date = (new Date()).toUTCString()

        // Storage account name, key and SAS token will be stored in these variables
        this._storageAccountName = false
        this._storageAccountKey = undefined
        this._storageAccountSasToken = undefined
    }

    /**
     * Return the request date stored into the object, for use with the "x-ms-date" header
     * 
     * @return {string} Date for the "x-ms-date" header
     */
    get date() {
        return this._date
    }

    /**
     * Getter for the list of headers to add to the request
     * 
     * @return {Object} List of headers to add to the request
     */
    get headers() {
        // Return a sorted object
        const builtIn = {
            'x-ms-date': this.date,
            'x-ms-version': this._apiVersion
        }
        const allHeaders = _.assign({}, this._customHeaders, builtIn)

        return Utils.sortObject(allHeaders)
    }

    /**
     * Add a custom "x-ms-*" header to the request.
     * 
     * @param {String} name - Name of the header (must start with "x-ms-*")
     * @param {String} value - Value of the header
     */
    addCustomHeader(name, value) {
        if (!name || !_.isString(name) || name.length < 1 ||
            !value || !_.isString(value) || value.length < 1
        ) {
            throw Error('Parameters name and value must be non-empty strings')
        }

        if (!name.match(/^x-ms-/i)) {
            throw Error('Header name does not start with "x-ms-"')
        }

        this._customHeaders[name.toLowerCase()] = value
    }

    /**
     * Manually set the storage account name and key
     * 
     * @param {string} name - Name for the storage account
     * @param {string} key - Access key for the storage account
     * @param {string} sasToken - SAS token for the storage account
     */
    setStorageAccount(name, key, sasToken) {
        if (!name || !_.isString(name) || name.length < 1) {
            throw Error('Parameter name must be a non-empty string')
        }

        const hasKey = !!(key && _.isString(key) && key.length > 1)
        const hasSasToken = !!(sasToken && _.isString(sasToken) && sasToken.length > 1)
        if ((!hasKey && !hasSasToken) || (hasKey && hasSasToken)) {
            throw Error('One and only one of key and sasToken must be set and a non-empty string')
        }

        this._storageAccountName = name
        this._storageAccountKey = hasKey ? key : undefined
        
        if (hasSasToken) {
            // Ensure the SAS token starts with ?
            if (sasToken.charAt(0) !== '?') {
                sasToken = '?' + sasToken
            }

            this._storageAccountSasToken = hasSasToken ? sasToken : undefined
        }
    }

    /**
     * Generate the signature for the Authorization header.
     *
     * When using SAS tokens, this returns null.
     * 
     * @return {string} Signature for the request
     */
    generateSignature() {
        if (!this._storageAccountName) {
            throw Error('You must set storage account name and key or SAS token')
        }

        // When using SAS tokens, return null
        if (this._storageAccountSasToken) {
            return null
        }

        const components = [
            this._verb, // HTTP verb
            this._contentMD5 || '', // Content-MD5
            this._contentType || '', // Content-Type
            '', // Date header (not used because of x-ms-date)
        ]

        // Build the "Canonicalized Header String" according to the documentation
        const allHeaders = this.headers // Already sorted
        const join = []
        for (const k in allHeaders) {
            if (allHeaders.hasOwnProperty(k)) {
                join.push(k + ':' + allHeaders[k].replace(/(\n|\r)/g, ' '))
            }
        }
        components.push(join.join('\n'))

        // Build the "Canonicalized Resource String"
        let resourceString = '/' + this._storageAccountName + this._blob

        // If using SAS tokens, append them
        if (this._storageAccountSasToken) {
            resourceString += this._storageAccountSasToken + '&api-version=' + this._apiVersion
        }

        components.push(resourceString)

        // String to sign
        const baseString = components.join('\n')

        // Compute the SHA256-HMAC
        const hmac = crypto.createHmac('sha256',
            Buffer.from(this._storageAccountKey || this._storageAccountSasToken, 'base64')
        )
        hmac.update(baseString)
        const signature = hmac.digest('base64')

        return signature 
    }

    /**
     * Generate the Authorization header for the request.
     *
     * When using SAS tokens, this returns null.
     * 
     * @return {string} Value for the Authorization header
     */
    generateAuthorizationHeader() {
        // When using SAS tokens, return null
        if (this._storageAccountSasToken) {
            return null
        }
        
        // Generate the signature
        const signature = this.generateSignature()

        return this._keyType + ' ' + this._storageAccountName + ':' + signature
    }

    /**
     * Return the list of all headers, including Authorization, Content-MD5 and Content-Type, ready for sending the request.
     * 
     * @return {Object} List of all headers
     */
    requestHeaders() {
        // Auth header
        const auth = this.generateAuthorizationHeader()
        const merge = auth ?
            {'Authorization': auth} :
            {}
        
        // Add Content-MD5 and Content-Type if necessary
        if (this._contentMD5) {
            merge['Content-MD5'] = this._contentMD5
        }
        if (this._contentType) {
            merge['Content-Type'] = this._contentType
        }

        return _.merge({}, this.headers, merge)
    }

    /**
     * Return values for the querystring of URLs when uploading a blob. This is necessary when using SAS tokens.
     *
     * @return {Object} Querystring values to append to blob URL when uploading
     */
    querystring() {
        // When using SAS tokens, add them
        if (this._storageAccountSasToken) {
            // Strip the leading ?, then parse using qs
            const qsSas = qs.parse(this._storageAccountSasToken.substring(1))

            // Add api-version
            qsSas['api-version'] = this._apiVersion

            return _.merge({}, this._qs, qsSas)
        }
        
        return this._qs
    }
}

module.exports = Authorization
