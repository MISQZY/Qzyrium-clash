const { runSuite } = require('./test-runner.cjs')

runSuite('functional').then(report => { process.exitCode = report.failed ? 1 : 0 })
  .catch(error => { console.error(error); process.exitCode = 1 })
