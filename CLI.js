'use strict'

const _ = require('lodash')
const fs = require('fs')
const program = require('commander')
const pkgInfo = require('./package.json')

const StreamUpload = require('./lib/StreamUpload')

// Validate that the console parameter is a positive integer
const validateInt = (val) => {
    let num = parseInt(val, 10)
    if(!num || num < 0 || num == NaN) {
        console.log('Invalid chunk number')
        process.exit(1)
    }
    return num
}

class CLI {
    constructor() {
        // Parse console options
        program
            .version(pkgInfo.version)
            .usage('[options] <input> <destinationPath>')
            //.option('-c, --chunks <n>', 'Number of chunks per blob [50000]', validateInt, 50000)
            //.option('--no-md5', 'Skip MD5 check when uploading chunks')
            .action(this.uploadStream)
        
        // Help messages
        program.on('--help', () => {
            console.log('  Arguments:')
            console.log('')
            console.log('    <input> is the path of a local file to upload; use - for reading from')
            console.log('    <destinationPath> is the path inside the Azure Blob Storage account used as destination; must include a container name (e.g. /container/path/to/file)')
            console.log('')
            console.log('  Authentication:')
            console.log('')
            console.log('    Use the following environmental variables to pass the storage account name and key:')
            console.log('      AZURE_STORAGE_ACCOUNT="storageaccountname"')
            console.log('      AZURE_STORAGE_ACCESS_KEY="abc123"')
            console.log('')
            console.log('  Examples:')
            console.log('')
            console.log('    $ azbak archive.tar /bak/data01.tar')
            console.log('    $ azbak - /container/file-from-stdin.tar')
            console.log('')
        })

        // Start the program
        program.parse(process.argv)
    }

    uploadStream(input, destinationPath) {
        if(!input
            || !destinationPath
            || typeof input != 'string'
            || typeof destinationPath != 'string') {
            program.help()
        }

        // Check if we're passed a file name; use stdin if input is "-"
        let sourceStream
        if(input == '-') {
            sourceStream = process.stdin
        }
        else {
            if(!fs.existsSync(input)) {
                console.log('File does not exist: ' + input)
                process.exit(2)
            }

            // Open a stream in read mode
            sourceStream = fs.createReadStream(input)
        }

        // Ensure destination path is valid
        if(!destinationPath.match(/\/(\$root|[a-z0-9](([a-z0-9\-])){1,61}[a-z0-9])\/(.*){1,1024}/)) {
            console.log(destinationPath + ' is not a valid resource name for a blob in Azure Blob Storage. Path must be in the format /container/path/to/file')
            process.exit(1)
        }

        // Ensure the required environmental variables are set
        if(!process.env.AZURE_STORAGE_ACCOUNT
            || !process.env.AZURE_STORAGE_ACCOUNT.match(/^[a-z0-9]{3,24}$/)
            || !process.env.AZURE_STORAGE_ACCESS_KEY
            || !process.env.AZURE_STORAGE_ACCESS_KEY.match(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)) {
            console.log('Environmental variables AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_ACCESS_KEY are not set or invalid')
            process.exit(3)
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
}

module.exports = CLI
