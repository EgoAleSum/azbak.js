/* eslint-disable prefer-arrow-callback */

'use strict'

const azure = require('azure-storage')

module.exports = {
    /**
     * In order to run the tests, we need to have access to an Azure Storage Account.
     *
     * The following environmental variables must be set:
     * AZURE_STORAGE_ACCOUNT
     * AZURE_STORAGE_ACCESS_KEY
     */
    RequireAuth() {
        if(!process.env.AZURE_STORAGE_ACCOUNT || !process.env.AZURE_STORAGE_ACCESS_KEY) {
            console.log('The test suite requires access to an Azure Storage Account. Please ensure that the following environmental variables are set: AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY.')
            this.skip()
        }
    },

    /**
     * Store credentials in the storageAccount param.
     *
     * The storageAccount param is modified.
     */
    GetCredentials(storageAccount) {
        return function() {
            // Get credentials from env
            storageAccount.name = process.env.AZURE_STORAGE_ACCOUNT
            storageAccount.key = process.env.AZURE_STORAGE_ACCESS_KEY
        }
    },

    /**
     * Returns a function that creates a test container
     */
    CreateTestContainer(storageAccount, containerName) {
        return function(done) {
            // Init azure-storage
            const blobService = azure.createBlobService(storageAccount.name, storageAccount.key)

            // Create a new container
            blobService.createContainer(containerName, {publicAccessLevel: 'blob'}, (err) => {
                if(err) {
                    throw err
                }

                done()
            })
        }
    },

    /**
     * Add a SAS token to the storageAccount object.
     * The original object is modified.
     */
    GetSASToken(storageAccount, containerName) {
        return function() {
            // Init azure-storage
            const blobService = azure.createBlobService(storageAccount.name, storageAccount.key)
            
            // Generate a new SAS token
            let startDate = new Date()
            let expiryDate = new Date()
            startDate.setTime(startDate.getTime() - 1000)
            expiryDate.setTime(expiryDate.getTime() + 3600*1000)

            let sharedAccessPolicy = {
                AccessPolicy: {
                    Services: azure.Constants.AccountSasConstants.Services.BLOB,
                    Permissions: azure.Constants.AccountSasConstants.Permissions.WRITE + 
                        azure.Constants.AccountSasConstants.Permissions.CREATE +
                        azure.Constants.AccountSasConstants.Permissions.ADD,
                    Protocols: azure.Constants.AccountSasConstants.Protocols.HTTPSONLY,
                    Start: startDate,
                    Expiry: expiryDate
                }
            }

            storageAccount.sasToken = blobService.generateSharedAccessSignature(containerName, null, sharedAccessPolicy)
        }
    },

    /**
     * Remove test container and all data.
     */
    RemoveTestContainer(storageAccount, containerName) {
        return function(done) {
            // Init azure-storage
            const blobService = azure.createBlobService(storageAccount.name, storageAccount.key)

            // Delete the container and all its contents
            blobService.deleteContainer(containerName, (err) => {
                if(err) {
                    throw err
                }

                done()
            })
        }
    }
}
