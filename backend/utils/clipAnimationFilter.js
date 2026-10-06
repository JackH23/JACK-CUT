const {
  getMediaAnimationSettings,
  getMediaAnimationExpressions,
} = require('../../frontend/lib/mediaAnimation');
const { getMediaParentTransform } = require('./mediaLayout');

function getClipAnimationConfig(clip) {
  return getMediaAnimationSettings(clip);
}

function getClipAnimationWindow(clip) {
  const settings = getMediaAnimationSettings(clip);
  const windows = [];
  for (const phase of ['In', 'Out']) {
    const preset = settings['animation' + phase + 'Preset'];
    const duration = settings['animation' + phase + 'Duration'];
    if (preset === 'none' || !duration || !settings['animation' + phase + 'Amount']) continue;
    windows.push(phase === 'In' || (settings.legacy && preset === 'zoom-out') ?
      'lt(t,' + duration + ')' : 'gte(t,' + (Number(clip.duration) - duration) + ')');
  }
  return windows.join('+') || '0';
}

function getClipAnimationFilters(clip, canvas = { width: 1920, height: 1080 }) {
  const base = getMediaParentTransform(clip, canvas.width, canvas.height);
  const transformed = base.scale !== 1 || base.offsetX !== 0 || base.offsetY !== 0;
  const settings = getMediaAnimationSettings(clip);
  const presets = ['In', 'Out'].map(phase => settings['animation' + phase + 'Preset']);
  const disjoint = settings.animationInDuration + settings.animationOutDuration <= Number(clip.duration);
  const separateFade = presets.filter(preset => preset.startsWith('fade-')).length === 1 &&
    presets.some(preset => preset.startsWith('zoom-') || preset.startsWith('slide-'));

  // A fade-only window needs no spatial sampling. Keep overlapping and legacy
  // effects in one inverse map, so their composition and old trajectories stay exact.
  if (!transformed && !settings.legacy && disjoint && separateFade) {
    const first = getClipAnimationFilters({ ...clip, animationOutPreset: 'none' });
    const last = getClipAnimationFilters({ ...clip, animationInPreset: 'none' });
    return [...first, ...(first.length ? last.filter(filter => filter !== 'format=yuva444p') : last)];
  }

  const { opacity, scale, offset } = getMediaAnimationExpressions(clip);
  if (opacity === 1 && scale === 1 && offset === 0) return [];
  const spatial = transformed || scale !== 1 || offset !== 0;
  const zoom = base.scale !== 1 || scale !== 1;

  // GEQ owns independent expression registers for each plane and slice thread.
  // At X=0, refresh time-only values once per frame and Y once per row. Register
  // 9 distinguishes an uninitialized cache from the legitimate first frame T=0.
  // Cache the composed affine inverse map once per frame. Keep bilinear
  // sampling and fractional geometry; never round changing zoom dimensions.
  const frameCache = 'if(eq(ld(0),T)*ld(9),0,' +
    'st(0,T);st(1,1/((' + base.scale + ')*(' + scale + ')));' +
    'st(2,(W-1)/2-((W-1)/2+W*(' + offset + ')*(' + base.scale + ')/100+(' + base.offsetX + '))*ld(1));' +
    'st(3,' + opacity + ');st(7,(H-1)/2-((H-1)/2+(' + base.offsetY + '))*ld(1));st(9,1))';
  const rowCache = 'if(eq(X,0),' + frameCache +
    (zoom ? ';st(5,Y*ld(1)+ld(7))' : '') + ',0);';
  const sx = spatial ? 'X*ld(1)+ld(2)' : 'X';
  const sy = zoom ? 'ld(5)' : base.offsetY !== 0 ? '(Y-(' + base.offsetY + '))' : 'Y';
  const color = plane => spatial ? rowCache + plane + '(' + sx + ',' + sy + ')' : plane + '(X,Y)';
  const alpha = 'alpha(' + (spatial ? 'ld(4)' : 'X') + ',' + sy + ')' +
    (opacity !== 1 ? '*ld(3)' : '');
  const alphaExpression = rowCache + (spatial ?
    'st(4,' + sx + ');if(between(ld(4),-0.5,W-0.5)' +
    (zoom || base.offsetY !== 0 ? '*between(' + sy + ',-0.5,H-0.5)' : '') + ',' + alpha + ',0)' : alpha);

  return ['format=yuva444p',
    "geq=lum='" + color('lum') + "':cb='" + color('cb') + "':cr='" + color('cr') +
    "':a='" + alphaExpression + "':enable='" + getClipAnimationWindow(clip) + "'"];
}

module.exports = { getClipAnimationConfig, getClipAnimationFilters, getClipAnimationWindow };
