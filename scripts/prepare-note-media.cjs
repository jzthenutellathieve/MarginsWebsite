const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function prepareNoteMedia(notes, outputDirectory) {
  const videos = notes.flatMap(note => note.media || []).filter(item => item.type === 'video');
  if (!videos.length) return;
  const ffmpeg = require('ffmpeg-static');
  const file = url => path.join(outputDirectory, url.replace(/^\//, ''));
  const run = args => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  for (const video of videos) {
    if (video.originalSrc) {
      fs.mkdirSync(path.dirname(file(video.src)), { recursive: true });
      run(['-i', file(video.originalSrc), '-map', '0:v:0', '-map', '0:a?',
        '-vf', 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,scale=1280:-2',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '24', '-tag:v', 'avc1',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-map_metadata', '-1', '-y', file(video.src)]);
    }
    if (video.poster && !fs.existsSync(file(video.poster))) {
      fs.mkdirSync(path.dirname(file(video.poster)), { recursive: true });
      run(['-ss', '1', '-i', file(video.src), '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', '-y', file(video.poster)]);
    }
  }
}

module.exports = { prepareNoteMedia };
