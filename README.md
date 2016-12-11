> **NOTE** This branch contains the work-in-progress code for azbak 2.0.
> Looking for the stable [1.0.0 release](https://github.com/EgoAleSum/azbak.js/tree/v1.0.0)?

# azbak

Command-line utility and Node.js module to backup a file or a stream to Azure Blob Storage.

Features:

- Fully stream-based
- The CLI supports piping input from a stream or reading from a file on disk
- Automatically chunks files/streams bigger than the maximum blob size (~195 GB) into multiple blobs
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

````
  Usage: azbak [options] <input> <destinationPath>

  Options:

    -h, --help        output usage information
    -V, --version     output the version number
    -b, --blocks <n>  Number of blocks per blob, each of 4MB [50000]
    --endpoint <host>  Endpoint to use [blob.core.windows.net]
    --no-md5          Skip MD5 check when uploading chunks

  Arguments:

    <input> is the path of a local file to upload; use - for reading from
    <destinationPath> is the path inside the Azure Blob Storage account used as destination; must include a container name (e.g. /container/path/to/file)

  Authentication:

    Use the following environmental variables to pass the storage account name and key:
      AZURE_STORAGE_ACCOUNT="storageaccountname"
      AZURE_STORAGE_ACCESS_KEY="abc123"

  Examples:

    $ azbak archive.tar /bak/data01.tar
    $ azbak - /container/file-from-stdin.tar
````

# Library

> TODO