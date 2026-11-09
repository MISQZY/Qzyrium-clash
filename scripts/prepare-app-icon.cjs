// Encode the existing RemnaWEB PNG as a Windows multi-resolution icon.
const { app, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const userData = path.resolve(__dirname, '../artifacts/icon-build')
fs.mkdirSync(userData, { recursive: true })
app.setPath('userData', userData)
app.commandLine.appendSwitch('disable-features', 'WinUseBrowserSpellChecker')
app.commandLine.appendSwitch('disable-spellcheck')
app.disableHardwareAcceleration()

app.whenReady().then(() => {
  const source = nativeImage.createFromPath(path.resolve(__dirname, '../resources/icon.png'))
  if (source.isEmpty()) throw new Error('resources/icon.png is missing or invalid')
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const images = sizes.map(size => source.resize({ width: size, height: size, quality: 'best' }).toPNG())
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + index * 16
    header[entry] = size === 256 ? 0 : size
    header[entry + 1] = size === 256 ? 0 : size
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(images[index].length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += images[index].length
  }
  fs.writeFileSync(path.resolve(__dirname, '../resources/icon.ico'), Buffer.concat([header, ...images]))
  console.log(`Prepared Windows druse icon: ${sizes.join(', ')}px`)
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
