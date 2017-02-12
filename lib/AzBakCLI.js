'use strict'

const fs = require('fs')
const program = require('commander')

const pkgInfo = require('../package.json')
const StreamUpload = require('./StreamUpload')

// Validate that the console parameter is a positive integer
const validateInt = (val) => {
    let num = parseInt(val, 10)
    if(!num || num < 0 || num == NaN) {
        console.log('Invalid number')
        process.exit(1)
    }
    return num
}

class AzBakCLI {
    constructor() {
        // Parse console options
        program
            .version(pkgInfo.version)
            .usage('[options] <input> <destinationPath>')
            .option('-b, --blocks <n>', 'Number of blocks per blob, each of fixed size [' + StreamUpload.maxBlocksPerBlob + ']', validateInt, StreamUpload.maxBlocksPerBlob)
            .option('-s, --block-size <n>', 'Size of each block uploaded in MB, max 100MB [' + StreamUpload.defaultBlockSize / 1024 / 1024 + ']', validateInt, StreamUpload.defaultBlockSize / 1024 / 1024)
            .option('-c, --concurrency <n>', 'Number of concurrent upload tasks [' + StreamUpload.defaultConcurrency + ']', validateInt, StreamUpload.defaultConcurrency)
            .option('--no-suffix', 'Upload a single blob only and do not append numeric suffix')
            .option('--endpoint <host>', 'Endpoint to use [' + StreamUpload.defaultEndpoint + ']', StreamUpload.defaultEndpoint)
            .option('--no-md5', 'Skip MD5 check when uploading chunks')
            .action(this.uploadStream)
        
        // Help messages
        program.on('--help', () => {
            console.log('  Arguments:')
            console.log('')
            console.log('    <input> is the path of a local file to upload; use - for reading from stdin')
            console.log('    <destinationPath> is the path inside the Azure Blob Storage account used as destination; must include a container name (e.g. /container/path/to/file)')
            console.log('')
            console.log('  Authentication:')
            console.log('')
            console.log('    Use the following environmental variables to pass the storage account name and key or SAS token:')
            console.log('      AZURE_STORAGE_ACCOUNT="storageaccountname"')
            console.log('      And either one of:')
            console.log('        AZURE_STORAGE_ACCESS_KEY="abc123"')
            console.log('        AZURE_STORAGE_SAS_TOKEN="?sv=...&sig=..."')
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
        // Ensure required parameters are set
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

        // Authentication holder
        let authObject = {}

        // Get account name and key from environmental variables by default:
        // AZURE_STORAGE_ACCOUNT
        // AZURE_STORAGE_ACCESS_KEY
        // (Same environmental variable used by the Azure CLI)
        if(!process.env.AZURE_STORAGE_ACCOUNT
            || !process.env.AZURE_STORAGE_ACCOUNT.match(/^[a-z0-9]{3,24}$/)) {
            console.log('Storage account name not set or invalid. Please set the environmental variable AZURE_STORAGE_ACCOUNT.')
            process.exit(3)
        }
        authObject.storageAccountName = process.env.AZURE_STORAGE_ACCOUNT

        // Get account key (if present) from env var:
        // AZURE_STORAGE_ACCESS_KEY
        // (Same environmental variable used by the Azure CLI)
        // If there's no storage account key, try with env var:
        // AZURE_STORAGE_SAS_TOKEN
        // For SAS token. If this is missing too, exit with error
        if(process.env.AZURE_STORAGE_ACCESS_KEY
            && process.env.AZURE_STORAGE_ACCESS_KEY.match(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)) {
            authObject.storageAccountKey = process.env.AZURE_STORAGE_ACCESS_KEY
        }
        else if(process.env.AZURE_STORAGE_SAS_TOKEN
                 && process.env.AZURE_STORAGE_SAS_TOKEN.match(/^(\?|&)?(\w+(=[\w-%:]*)?(&\w+(=[\w-%:]*)?)*)?$/)) {
            authObject.storageAccountSasToken = process.env.AZURE_STORAGE_SAS_TOKEN
        }
        else {
            console.log('Storage account key or SAS token not set or invalid. Please set the environmental variables AZURE_STORAGE_ACCESS_KEY or AZURE_STORAGE_SAS_TOKEN.')
            process.exit(3)
        }

        // Create the StreamUpload object
        let upload = new StreamUpload(sourceStream, destinationPath, authObject)
        
        // Pass options
        if(program.blocks) {
            upload.blocksPerBlob = program.blocks
        }
        if(program.blockSize) {
            upload.blockSize = program.blockSize * 1024 * 1024
        }
        if(program.concurrency) {
            upload.concurrency = program.concurrency
        }
        upload.singleBlob = !program.suffix
        upload.md5 = !!program.md5
        if(program.endpoint) {
            upload.endpoint = program.endpoint
        }

        // Start the upload
        upload.upload()
            .then((urls) => {
                console.log(urls.join('\n'))
            }, (err) => {
                console.log('Error: ', err.message)
            })
    }
}

module.exports = AzBakCLI
