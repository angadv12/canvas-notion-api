const { runCli } = require('./src/cli')

const args = process.argv.slice(2)
runCli(args.length ? args : ['sync']).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
