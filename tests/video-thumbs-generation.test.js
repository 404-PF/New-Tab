import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const toolPath = path.resolve(process.cwd(), 'background/tools/video_thumbs_generation.js');
const toolSource = readFileSync(toolPath, 'utf8');

function loadTool({ ffmpegPath, statSync, accessSync, execFileSync = vi.fn() } = {}) {
  const module = { exports: {} };
  const fs = {
    constants: { X_OK: 1 },
    statSync: statSync || vi.fn(() => ({ isFile: () => true })),
    accessSync: accessSync || vi.fn(),
  };
  const console = {
    error: vi.fn(),
    log: vi.fn(),
  };
  const require = (moduleName) => {
    if (moduleName === 'fs') return fs;
    if (moduleName === 'path') return path;
    if (moduleName === 'child_process') return { execFileSync };
    throw new Error(`Unexpected module: ${moduleName}`);
  };

  vm.runInNewContext(toolSource, {
    __dirname: path.dirname(toolPath),
    console,
    module,
    process: { env: { FFMPEG_PATH: ffmpegPath } },
    require,
  }, { filename: toolPath });

  return { console, execFileSync, fs, tool: module.exports };
}

describe('video thumbnail generator', () => {
  const absolutePath = path.resolve(toolPath);

  it('does not run the generator when imported', () => {
    const { execFileSync } = loadTool({ ffmpegPath: absolutePath });

    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('accepts only an absolute, executable regular file as FFMPEG_PATH', () => {
    const accessSync = vi.fn();
    const { fs, tool } = loadTool({
      ffmpegPath: absolutePath,
      accessSync,
    });

    expect(tool.getFFmpegPath()).toBe(absolutePath);
    expect(fs.statSync).toHaveBeenCalledWith(absolutePath);
    expect(accessSync).toHaveBeenCalledWith(absolutePath, fs.constants.X_OK);
    expect(loadTool().tool.getFFmpegPath()).toBeNull();

    expect(loadTool({ ffmpegPath: 'ffmpeg' }).tool.getFFmpegPath()).toBeNull();
    expect(loadTool({
      ffmpegPath: absolutePath,
      statSync: vi.fn(() => ({ isFile: () => false })),
    }).tool.getFFmpegPath()).toBeNull();
    expect(loadTool({
      ffmpegPath: absolutePath,
      accessSync: vi.fn(() => { throw new Error('EACCES'); }),
    }).tool.getFFmpegPath()).toBeNull();
    expect(loadTool({
      ffmpegPath: absolutePath,
      statSync: vi.fn(() => { throw new Error('ENOENT'); }),
    }).tool.getFFmpegPath()).toBeNull();
  });

  it('uses an argv array and bounded execution times for FFmpeg', () => {
    const execFileSync = vi.fn();
    const { tool } = loadTool({ execFileSync });
    const videoPath = path.resolve('live_background', 'trailer;still-a-filename.mp4');
    const outputPath = path.resolve('thumbs', 'trailer.jpeg');

    expect(tool.checkFFmpeg(absolutePath)).toBe(true);
    expect(execFileSync).toHaveBeenNthCalledWith(1, absolutePath, ['-version'], {
      stdio: 'ignore',
      timeout: 15_000,
    });

    expect(tool.generateThumbnail(absolutePath, videoPath, outputPath, '00:00:05')).toBe(true);
    expect(execFileSync).toHaveBeenNthCalledWith(2, absolutePath, [
      '-y',
      '-ss', '00:00:05',
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '72',
      '-vf', 'scale=-1:128,crop=128:128',
      outputPath,
    ], {
      stdio: 'pipe',
      timeout: 30_000,
    });
  });

  it('reports FFmpeg invocation failures without throwing', () => {
    const execFileSync = vi.fn(() => { throw new Error('failed'); });
    const { tool } = loadTool({ execFileSync });

    expect(tool.checkFFmpeg(absolutePath)).toBe(false);
    expect(tool.generateThumbnail(absolutePath, 'video.mp4', 'thumb.jpeg')).toBe(false);
  });
});
