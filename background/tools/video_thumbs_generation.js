// video_thumbs_generation.js
// Generates thumbnails from video files using FFmpeg
// Run with: node background/tools/video_thumbs_generation.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LIVE_BG_DIR = path.join(__dirname, '../live_background');
const OUT_DIR = path.join(__dirname, '../thumbs');

// Thumbnail settings
const THUMB_SIZE = 128;
const JPEG_QUALITY = 72;
const DEFAULT_TIMESTAMP = '00:00:02'; // Extract frame at 2 seconds

function isVideo(file) {
  return /\.(mp4|webm|ogg)$/i.test(file);
}

function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function generateThumbnail(videoPath, outputPath, timestamp = DEFAULT_TIMESTAMP) {
  console.log(`Generating thumbnail for: ${path.basename(videoPath)}`);
  
  // Use scale with aspect fill (crop to fill, no letterboxing)
  // First scale to height=128 (auto width), then crop center to 128x128
  // This ensures we have enough vertical pixels to crop
  const filter = `scale=-1:${THUMB_SIZE},crop=${THUMB_SIZE}:${THUMB_SIZE}`;
  
  const args = [
    '-y', // Overwrite output file
    '-ss', timestamp, // Seek to timestamp
    '-i', `"${videoPath}"`, // Input file
    '-vframes', '1', // Extract single frame
    '-q:v', JPEG_QUALITY.toString(), // Quality
    '-vf', filter, // Scale up/down then crop to fill (no padding)
    `"${outputPath}"` // Output file
  ];

  try {
    execSync(`ffmpeg ${args.join(' ')}`, { stdio: 'pipe' });
    console.log(`✓ Created: ${path.basename(outputPath)}`);
    return true;
  } catch (e) {
    console.error(`✗ Failed to generate thumbnail for ${videoPath}`);
    console.error(e.message);
    return false;
  }
}

async function main() {
  console.log('Video Thumbnail Generator');
  console.log('=========================\n');

  // Check for FFmpeg
  if (!checkFFmpeg()) {
    console.error('ERROR: FFmpeg is not installed or not in PATH.');
    console.error('Please install FFmpeg to generate video thumbnails.');
    console.error('\nInstallation options:');
    console.error('  - Windows: choco install ffmpeg');
    console.error('  - macOS: brew install ffmpeg');
    console.error('  - Linux: sudo apt install ffmpeg');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUT_DIR}\n`);
  }

  // Check if live_background directory exists
  if (!fs.existsSync(LIVE_BG_DIR)) {
    console.log('No live_background directory found.');
    return;
  }

  // Get video files
  const files = fs.readdirSync(LIVE_BG_DIR).filter(isVideo);

  if (files.length === 0) {
    console.log('No video files found in /live_background');
    return;
  }

  console.log(`Found ${files.length} video file(s)\n`);

  // Generate thumbnails for each video
  for (const file of files) {
    const videoPath = path.join(LIVE_BG_DIR, file);
    
    // Generate output filename (replace spaces and video extension)
    const base = file.replace(/\.(mp4|webm|ogg)$/i, '').replace(/\s+/g, '_');
    const outPath = path.join(OUT_DIR, `${base}.jpeg`);

    const success = generateThumbnail(videoPath, outPath);
    if (!success) {
      console.log(`Skipping ${file} due to errors`);
    }
  }

  console.log('\nDone!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
