const fs = require('fs')
const path = require('path')

// Ensure the destination directory exists
const destDir = path.join(__dirname, 'dist', 'worker-threads')
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
}

// Copy the worker file
const srcPath = path.join(__dirname, 'src', 'worker-threads', 'worker.js')
const destPath = path.join(destDir, 'worker.js')

fs.copyFileSync(srcPath, destPath)
console.log(`Copied worker.js to ${destPath}`)
