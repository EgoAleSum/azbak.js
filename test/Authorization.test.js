/* eslint-env node, mocha */
/* eslint-disable prefer-arrow-callback, no-new */

'use strict'

const assert = require('assert')
const TestUtils = require('./_TestUtils')

const Authorization = require('../lib/Authorization')

describe('Authorization', function() {
    let storageAccount = {
        name: null,
        key: null,
        sasToken: null
    }

    // Container name where data is stored
    let containerName = 'test-' + parseInt(Date.now() / 1000, 10)

    before('ensure credentials are passed', TestUtils.RequireAuth)
    before('get credentials', TestUtils.GetCredentials(storageAccount))
    before('get sas token', TestUtils.GetSASToken(storageAccount, containerName))
    
    it('constructor', function() {
        assert.throws(() => {
            new Authorization('PUT', 'invalid')
        }, /string starting with \//)

        assert.throws(() => {
            new Authorization('PUT')
        }, /string starting with \//)

        new Authorization('GET', '/blob/name')

        new Authorization('GET', '/blob/name', {
            contentMD5: '36920eb5dd1b993cf73086d2afde23b1',
            contentType: 'image/jpeg',
            qs: {
                foo: 'bar',
                hello: 'world'
            }
        })
    })

    it('setStorageAccount', function() {
        let auth = new Authorization('GET', '/blob/name')
        
        auth.setStorageAccount('accountname', 'AccountKey')
        auth.setStorageAccount('accountname', null, 'SASToken')

        assert.throws(() => {
            auth.setStorageAccount(null, 'accountKey')
        }, /name/)

        assert.throws(() => {
            auth.setStorageAccount('accountname')
        }, /key and sasToken/i)

        assert.throws(() => {
            auth.setStorageAccount('accountname', 'key', 'sas')
        }, /key and sasToken/i)
    })
})