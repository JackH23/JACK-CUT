const {
  getMediaAnimationSettings,
  getMediaAnimationExpressions,
} = require('../../frontend/lib/mediaAnimation');

function getClipAnimationConfig(clip) {
  return getMediaAnimationSettings(clip);
}

function getClipAnimationFilters(clip) {
  const settings = getMediaAnimationSettings(clip);
  const presets = ['In', 'Out'].map(phase => settings['animation' + phase + 'Preset']);
  const disjoint = settings.animationInDuration + settings.animationOutDuration <= Number(clip.duration);
  const separateFade = presets.filter(preset => preset.startsWith('fade-')).length === 1 &&
    presets.some(preset => preset.startsWith('zoom-') || preset.startsWith('slide-'));

  // A fade-only window needs no spatial sampling. Keep overlapping and legacy
  // effects in one inverse map, so their composition and old trajectories stay exact.
  if (!settings.legacy && disjoint && separateFade) {
    const first = getClipAnimationFilters({ ...clip, animationOutPreset: 'none' });
    const last = getClipAnimationFilters({ ...clip, animationInPreset: 'none' });
    return [...first, ...(first.length ? last.filter(filter => filter !== 'format=yuva444p') : last)];
  }

  const { opacity, scale, offset } = getMediaAnimationExpressions(clip);
  if (opacity === 1 && scale === 1 && offset === 0) return [];
  const spatial = scale !== 1 || offset !== 0;
  const zoom = scale !== 1;

  // GEQ owns independent expression registers for each plane and slice thread.
  // At X=0, refresh time-only values once per frame and Y once per row. Register
  // 9 distinguishes an uninitialized cache from the legitimate first frame T=0.
  // Keep the original arithmetic order and bilinear sampler; do not approximate
  // a fractional slide position or round changing zoom dimensions.
  const frameCache = 'if(eq(ld(0),T)*ld(9),0,' +
    'st(0,T);st(1,' + scale + ');st(2,W*(' + offset + ')/100);' +
    'st(3,' + opacity + ');st(6,(W-1)/2);st(7,(H-1)/2);st(9,1))';
  const rowCache = 'if(eq(X,0),' + frameCache +
    (zoom ? ';st(5,(Y-ld(7))/ld(1)+ld(7))' : '') + ',0);';
  const sx = spatial ? '(X-ld(6)-ld(2))' + (zoom ? '/ld(1)' : '') + '+ld(6)' : 'X';
  const sy = zoom ? 'ld(5)' : 'Y';
  const color = plane => spatial ? rowCache + plane + '(' + sx + ',' + sy + ')' : plane + '(X,Y)';
  const alpha = 'alpha(' + (spatial ? 'ld(4)' : 'X') + ',' + sy + ')' +
    (opacity !== 1 ? '*ld(3)' : '');
  const alphaExpression = rowCache + (spatial ?
    'st(4,' + sx + ');if(between(ld(4),-0.5,W-0.5)' +
    (zoom ? '*between(ld(5),-0.5,H-0.5)' : '') + ',' + alpha + ',0)' : alpha);

  const windows = [];
  for (const phase of ['In', 'Out']) {
    const preset = settings['animation' + phase + 'Preset'];
    const duration = settings['animation' + phase + 'Duration'];
    if (preset === 'none' || !duration || !settings['animation' + phase + 'Amount']) continue;
    windows.push(phase === 'In' || (settings.legacy && preset === 'zoom-out') ?
      'lt(t,' + duration + ')' : 'gte(t,' + (Number(clip.duration) - duration) + ')');
  }
  return ['format=yuva444p',
    "geq=lum='" + color('lum') + "':cb='" + color('cb') + "':cr='" + color('cr') +
    "':a='" + alphaExpression + "':enable='" + windows.join('+') + "'"];
}

module.exports = { getClipAnimationConfig, getClipAnimationFilters };
