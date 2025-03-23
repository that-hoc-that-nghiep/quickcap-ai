/* eslint-disable */
// This script is used in development to copy the worker.js file to the dist folder
// It is excluded from TypeScript compilation and ESLint checking

const fs = require('fs')
const path = require('path')

// For development, we'll copy the worker.js file to the dist folder directly
// This allows nodemon to pick up changes to the worker.js file without requiring a full rebuild

// Ensure the destination directory exists
const destDir = path.join(__dirname, 'dist', 'worker-threads')
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
}

// Copy the worker file
const srcPath = path.join(__dirname, 'src', 'worker-threads', 'worker.js')
const destPath = path.join(destDir, 'worker.js')

try {
    fs.copyFileSync(srcPath, destPath)
    console.log(`[DEV] Copied worker.js to ${destPath}`)
} catch (error) {
    console.error(`[DEV] Error copying worker.js: ${error.message}`)
}
