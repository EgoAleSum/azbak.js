'use strict'

const _ = require('lodash')
const fs = require('fs')

const StreamUpload = require('./StreamUpload')

module.exports = () => {
    // Read command line parameters. Should be <input> <destinationPath>
    // Require a length of 4 because indexes 0 and 1 are used by Node and by the script name
    if(!process.argv
        || !_.isArray(process.argv)
        || process.argv.length != 4
        || !process.argv) {
        // Display help message
        console.log('Usage: azbak <input> <destinationPath>')
        console.log('')
        console.log('Send a file or a stream to Azure Blob Storage for backup.')
        console.log('')
        console.log('  Arguments:')
        console.log('    <input> is the path of a local file to upload; use - for reading from')
        console.log('    <destinationPath> is the path inside the Azure Blob Storage account used as destination; must include a container name (e.g. /container/path/to/file)')
        console.log('')
        console.log('  Authentication:')
        console.log('  Use the following environmental variables to pass the storage account name and key:')
        console.log('    AZURE_STORAGE_ACCOUNT="storageaccountname"')
        console.log('    AZURE_STORAGE_ACCESS_KEY="abc123"')
        console.log('')
        console.log('  Examples:')
        console.log('    $ azbak archive.tar /bak/data01.tar')
        console.log('    $ azbak - /container/file-from-stdin.tar')
        return
    }

    // Check if we're passed a file name; use stdin if filename is "-"
    let sourceStream
    let filename = process.argv[2]
    if(filename == '-') {
        sourceStream = process.stdin
    }
    else {
        if(!fs.existsSync(filename)) {
            console.log('File does not exist: ' + filename)
        }

        // Open a stream in read mode
        sourceStream = fs.createReadStream(filename)
    }

    // Ensure destination path is valid
    let destinationPath = process.argv[3]
    if(!destinationPath.match(/\/(\$root|[a-z0-9](([a-z0-9\-])){1,61}[a-z0-9])\/(.*){1,1024}/)) {
        console.log(destinationPath + ' is not a valid resource name for a blob in Azure Blob Storage. Path must be in the format /container/path/to/file')
        return
    }

    // Ensure the required environmental variables are set
    if(!process.env.AZURE_STORAGE_ACCOUNT
        || !process.env.AZURE_STORAGE_ACCOUNT.match(/^[a-z0-9]{3,24}$/)
        || !process.env.AZURE_STORAGE_ACCESS_KEY
        || !process.env.AZURE_STORAGE_ACCESS_KEY.match(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)) {
        console.log('Environmental variables AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY are not set or invalid')
        return
    }

    // Start the upload
    let upload = new StreamUpload(sourceStream, destinationPath)
    upload.upload()
        .then((urls) => {
            console.log(urls.join('\n'))
        }, (err) => {
            console.log('Error', err)
        })
}
