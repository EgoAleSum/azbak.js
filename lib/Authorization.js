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
        if(!blob || !_.isString(blob) || !blob.startsWith('/')) {
            throw Error('Parameter blob must be a string starting with /')
        }

        // Store parameters
        this._verb = verb
        this._blob = blob

        // Extra parameters (optional)
        this._contentType = undefined
        this._contentMD5 = undefined
        if(extra && _.isObject(extra) && !_.isEmpty(extra)) {
            // Content-MD5 and Content-Type
            if(extra.contentMD5 && _.isString(extra.contentMD5)) {
                this._contentMD5 = extra.contentMD5
            }
            if(extra.contentType && _.isString(extra.contentType)) {
                this._contentType = extra.contentType
            }
            
            // Querystring
            if(extra.qs) {
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

        // Storage account name and key will be stored in these variables
        this._storageAccountName = false
        this._storageAccountKey = false
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
        let builtIn = {
            'x-ms-date': this.date,
            'x-ms-version': this._apiVersion
        }
        let allHeaders = _.assign({}, this._customHeaders, builtIn)

        return Utils.sortObject(allHeaders)
    }

    /**
     * Add a custom "x-ms-*" header to the request.
     * 
     * @param {String} name - Name of the header (must start with "x-ms-*")
     * @param {String} value - Value of the header
     */
    addCustomHeader(name, value) {
        if(!name || !_.isString(name) || name.length < 1 ||
            !value || !_.isString(value) || value.length < 1
        ) {
            throw Error('Parameters name and value must be non-empty strings')
        }

        if(!name.match(/^x\-ms\-/i)) {
            throw Error('Header name does not start with "x-ms-"')
        }

        this._customHeaders[name.toLowerCase()] = value
    }

    /**
     * Manually set the storage account name and key
     * 
     * @param {string} name - Name for the storage account
     * @param {string} key - Access key for the storage account
     */
    setStorageAccount(name, key) {
        if(!name || !_.isString(name) || name.length < 1 ||
            !key || !_.isString(key) || key.length < 1
        ) {
            throw Error('Parameters name and key must be non-empty strings')
        }

        this._storageAccountName = name
        this._storageAccountKey = key
    }

    /**
     * Generate the signature for the Authorization header
     * 
     * @return {string} Signature for the request
     */
    generateSignature() {
        if(!this._storageAccountName || !this._storageAccountKey) {
            throw Error('You must set storage account name and key')
        }

        let components = [
            this._verb, // HTTP verb
            this._contentMD5 || '', // Content-MD5
            this._contentType || '', // Content-Type
            '', // Date header (not used because of x-ms-date)
        ]

        // Build the "Canonicalized Header String" according to the documentation
        let allHeaders = this.headers // Already sorted
        let join = []
        for(let k in allHeaders) {
            if(allHeaders.hasOwnProperty(k)) {
                join.push(k + ':' + allHeaders[k].replace(/(\n|\r)/g, ' '))
            }
        }
        components.push(join.join("\n"))

        // Build the "Canonicalized Resource String"
        components.push('/' + this._storageAccountName + this._blob)

        // String to sign
        let baseString = components.join("\n")

        // Compute the SHA256-HMAC
        let hmac = crypto.createHmac('sha256', new Buffer(this._storageAccountKey, 'base64'))
        hmac.update(baseString)
        let signature = hmac.digest('base64')

        return signature 
    }

    /**
     * Generate the Authorization header for the request
     * 
     * @return {string} Value for the Authorization header
     */
    generateAuthorizationHeader() {
        // Generate the signature
        let signature = this.generateSignature()

        return this._keyType + ' ' + this._storageAccountName + ':' + signature
    }

    /**
     * Return the list of all headers, including Authorization, Content-MD5 and Content-Type, ready for sending the request.
     * 
     * @return {Object} List of all headers
     */
    requestHeaders() {
        // Auth header
        let auth = this.generateAuthorizationHeader()
        let merge = {'Authorization': auth}
        
        // Add Content-MD5 and Content-Type if necessary
        if(this._contentMD5) {
            merge['Content-MD5'] = this._contentMD5
        }
        if(this._contentType) {
            merge['Content-Type'] = this._contentType
        }

        return _.merge({}, this.headers, merge)
    }
}

module.exports = Authorization
