#!/usr/bin/env node
const { runCli } = require('../src/cli')

runCli().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
