# azbak

Small utility to backup a file or a stream to Azure Blob Storage.

Features:

- Supports piping input from a stream
- Automatically chunks files/streams bigger than ~195GB into multiple blobs
- Cross-platform
- Small memory footprint

## Installation

azbak requires Node.js version 4.0 or higher and NPM.

You can install the NPM package with:

````sh
# Depending on your system, you may need to run this as root or add "sudo"
$ npm install --global azbak
````

## Usage

````
Usage: azbak <input> <destinationPath>

Send a file or a stream to Azure Blob Storage for backup.

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
