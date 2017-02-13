'use strict'

module.exports = {
    /**
     * In order to run the tests, we need to have access to an Azure Storage Account.
     *
     * The following environmental variables must be set:
     * AZURE_STORAGE_ACCOUNT
     * AZURE_STORAGE_ACCESS_KEY
     */
    RequireAuth: function() {
        if(!process.env.AZURE_STORAGE_ACCOUNT || !process.env.AZURE_STORAGE_ACCESS_KEY) {
            console.log('The test suite requires access to an Azure Storage Account. Please ensure that the following environmental variables are set: AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY.')
            this.skip()
        }
    }
}
