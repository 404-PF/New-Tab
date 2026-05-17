// scripts/generate-thumbs.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BG_DIR = path.join(__dirname, '..');  
const OUT_DIR = path.join(BG_DIR, 'thumbs');

// Size of preview
const THUMB_SIZE = 128;     
const JPEG_QUALITY = 72;

function isImage(file) {
  return /\.(jpe?g|png)$/i.test(file);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(BG_DIR).filter(isImage);

  if (files.length === 0) {
    console.log('No images found in /background');
    return;
  }

  for (const file of files) {
    const inPath = path.join(BG_DIR, file);

    // normalize output name to .jpeg
    const base = file.replace(/\.(jpe?g|png)$/i, '');
    const outPath = path.join(OUT_DIR, `${base}.jpeg`);

    await sharp(inPath)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(outPath);

    console.log(`✓ ${file} -> thumbs/${base}.jpeg`);
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
