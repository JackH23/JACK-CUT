const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getClipAnimationFilters, getClipFadeCommands, getClipAnimationWindow } = require('../utils/clipAnimationFilter');

test('alpha LUT matches GEQ at every integer fade amount, with overlapping fades and source transparency', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jackcut-fade-lut-'));
  const source = "testsrc2=s=160x90:r=30:d=0.2,format=yuva444p,geq=lum='255*X/W':cb='255*Y/H':cr='255*(X+Y)/(W+H)':a=255*X/W";
  const render = (filter, duration) => {
    const run = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-filter_threads', '1', '-f', 'lavfi', '-i', source.replace('d=0.2', 'd=' + duration),
      '-vf', filter, '-pix_fmt', 'yuva444p', '-f', 'rawvideo', '-'], { cwd: scratch, maxBuffer: 10000000 });
    assert.equal(run.status, 0, run.stderr.toString());
    return run.stdout;
  };
  try {
    const cases = [...Array.from({length:101}, (_, amount) => ({amount, duration:.2, fadeDuration:.15})),
      ...[1,37.5,50,100].map(amount => ({amount, duration:1, fadeDuration:.2}))];
    for (const {amount, duration, fadeDuration} of cases) {
      const clip = { duration, animationInPreset: 'fade-in', animationInDuration: fadeDuration, animationInAmount: amount,
        animationOutPreset: 'fade-out', animationOutDuration: fadeDuration, animationOutAmount: amount };
      fs.writeFileSync(path.join(scratch, 'fade.cmd'), getClipFadeCommands(clip, 30, 'lutyuv@fade'));
      const baseline = render(getClipAnimationFilters(clip).join(',') || 'null', duration);
      const optimized = render(`sendcmd=f='fade.cmd',lutyuv@fade=y=val:u=val:v=val:a=val:enable='${getClipAnimationWindow(clip)}'`, duration);
      assert.deepEqual(optimized, baseline, 'amount ' + amount + ' must preserve all color and alpha bytes');
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('long static interiors do not rebuild the alpha LUT on every frame', () => {
  const clip = { duration: 600, animationInPreset: 'fade-in', animationInDuration: 1, animationInAmount: 50,
    animationOutPreset: 'fade-out', animationOutDuration: 1, animationOutAmount: 50 };
  assert.ok(getClipFadeCommands(clip, 30, 'lutyuv@fade').split('\n').length <= 62);
});
