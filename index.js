#!/usr/bin/env node

'use strict'

// Include the DebugLog function (global method)
require('./lib/DebugLog')

// Start the application
const CLI = require('./CLI')
new CLI()
