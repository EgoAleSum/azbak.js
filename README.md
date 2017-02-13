> **NOTE** This branch contains the work-in-progress code for azbak 2.0 beta.
> Looking for the stable [1.0.0 release](https://github.com/EgoAleSum/azbak.js/tree/v1.0.0)?

# azbak

Command-line utility and Node.js module to backup a file or a stream to Azure Blob Storage.

Features:

- Fully stream-based
- The CLI supports piping input from a stream or reading from a file on disk
- Automatically chunks files/streams bigger than the maximum blob size (~4.8 TB) into multiple blobs
- Cross-platform
- Small memory footprint

# Command-line tool

## Installation

azbak requires Node.js version 4.0 or higher and NPM.

You can install the application from NPM:

````sh
# Depending on your system, you may need to run this as root or add "sudo"
$ npm install --global azbak
````

## Usage

Command reference:

````
$ azbak [options] <input> <destinationPath>
````

### Authentication

You need to authenticate against Azure Blob Storage using a storage account name and an access key. azbak supports passing these values in the same way as the official Azure CLI, using environmental variables **`AZURE_STORAGE_ACCOUNT`** and **`AZURE_STORAGE_ACCESS_KEY`**.

Alternatively, you can authenticate using [Shared Access Signature (SAS) tokens](https://docs.microsoft.com/en-us/azure/storage/storage-dotnet-shared-access-signature-part-1), which are limited in time and scope, and are a safer alternative for scripts, cron jobs, etc. To use SAS tokens, pass authentication data with the environmental variables **`AZURE_STORAGE_ACCOUNT`** and **`AZURE_STORAGE_SAS_TOKEN`**.

### Arguments

**`input`** is either:
- The path of a local file to upload (e.g. `/path/to/file.jpg`)
- A dash (**`-`**) to read from stdin

**`destinationPath`** is the path inside the Azure Blob Storage account used as destination. It has to start with a slash and include a container name (e.g. `/container/path/to/file.jpg`). The destination name always has a sequence number automatically appended (e.g. `.000`, `.001`, etc).

### Options

The following command line options are available:

- **`-b`** or **`--blocks`**: Number of blocks in each blob sent to Azure Blob Storage, each of a fixed size. The maximum (and default) value is 50,000. Setting this to a lower value can lead to more, separate blobs to be created. Because each blob has a performance target of 60MB/s, having your data split into multiple blobs allows for parallel downloads and so potentially faster restores. This has no impact on upload speed, however, as uploads are always sequential.
- **`-s`** or **`--block-size`**: Size of each block sent to Azure Blob Storage. The maximum size is 100MB, but the default value is 20MB to reduce memory footprint. Bigger block sizes allow for larger blobs: assuming 50,000 blocks per blob (the default and maximum value), with 100MB-blocks each blob can be up to ~4.8TB, while with 20MB-blocks blobs are limited to ~1TB.
- **`-c`** or **`--concurrency`**: Number of chunks to upload in parallel (default is 3). Higher parallelization could help ensuring an efficient use of your Internet connection, but will require more memory.
- **`--no-suffix`**: Upload a single blob only, without appending a numeric suffix to the file name (e.g. `.000`). Please note that if the file is too big to fit in one blob (as defined by `blocks * blockSize`), the upload will fail.
- **`--endpoint`**: Endpoint to use. The default value is `blob.core.windows.net`, which is used by the global Azure infrastructure. Other common values are `blob.core.cloudapi.de` for Azure Germany and `blob.core.chinacloudapi.cn` for Azure China. Users of Azure Stack can enter their custom endpoint.
- **`--no-md5`**: Skip calculating MD5 checksums locally before uploading blocks. This can speed up operation on slower systems, but offers no protection against data corruption while in transit.
- **`-h`** or **`--help`**: Prints help message
- **`-V`** or **`--version`**: Prints application version

### Examples

Set credentials:

````sh
# First method: use export statements (bash syntax)
$ export AZURE_STORAGE_ACCOUNT="storageaccountname"
$ export AZURE_STORAGE_ACCESS_KEY="abc123"
$ azbak archive.tar /bak/data01.tar

# Second method: pass arguments inline
$ AZURE_STORAGE_ACCOUNT="storageaccountname" AZURE_STORAGE_ACCESS_KEY="abc123" azbak archive.tar /bak/data01.tar

# Use SAS Tokens
$ export AZURE_STORAGE_ACCOUNT="storageaccountname"
$ export AZURE_STORAGE_SAS_TOKEN="?sv=...&sig=..."
$ azbak archive.tar /bak/data01.tar
````

Upload file from local disk:

````sh
# Upload file archive.tar to Azure Blob Storage, named "path/data01.tar" inside the Storage Account "bak"
$ azbak archive.tar /bak/path/data01.tar
````

Stream from stdin:

````sh
# Syntax
$ azbak - /container/file-from-stdin.tar

# Example: gzip file and upload
$ cat largefile.dat | gzip | azbak - /bak/largefile.dat.gz
````

# Library

## Installation

azbak requires Node.js version 4.0 or higher and NPM.

You can install the package from NPM:

````sh
$ npm install --save azbak
````

## Usage

You can use azbak as a library for other Node.js applications.

Example code:

````js
const StreamUpload = require('azbak')

// Authentication data
let authData = {
    storageAccountName: storageAccountName,
    storageAccountKey: storageAccountKey,
    // If using SAS token, instead of storageAccountKey use:
    //storageAccountSasToken: storageAccountSasToken
}

// Create the StreamUpload object
let upload = new StreamUpload(sourceStream, destinationPath, authData)

// Pass options
upload.blockSize = 10 * 1024 * 1024

// Start upload
let uploadPromise = upload.upload()

// uploadPromise is a then-able
uploadPromise.then((urls) => {
    // List of blobs uploaded
    console.log(urls)
}, (err) => {
    // In case of errors
    console.log('Upload failed: ', err)
})
````

Full API documentation is available in the [/docs](docs) folder.
