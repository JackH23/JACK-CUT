const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
let catalog;
const linuxFamilies = new Map();
function fontconfigFamily(family, weight) {
  if (process.platform !== 'linux') return family;
  const key = family + ':' + weight;
  if (!linuxFamilies.has(key)) {
    try {
      const matched = execFileSync('fc-match', ['-f', '%{family}', family + ':weight=' + (weight === 700 ? 'bold' : 'regular')], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
      linuxFamilies.set(key, matched.trim().split(',')[0].toLowerCase() || family);
    } catch { linuxFamilies.set(key, family); }
  }
  return linuxFamilies.get(key);
}

// libass sizes a font's ascender+descender cell; CSS font-size sizes its EM.
// Read those metrics from the same installed font instead of hardcoding an
// Arial correction. No database/font_options changes or raster processing.
function readFontFaces(buffer) {
  const offsets = buffer.toString('ascii', 0, 4) === 'ttcf'
    ? Array.from({ length: buffer.readUInt32BE(8) }, (_, i) => buffer.readUInt32BE(12 + i * 4)) : [0];
  return offsets.flatMap(offset => {
    const tables = {};
    for (let i = 0; i < buffer.readUInt16BE(offset + 4); i++) {
      const entry = offset + 12 + i * 16;
      tables[buffer.toString('ascii', entry, entry + 4)] = buffer.readUInt32BE(entry + 8);
    }
    if (!tables.head || !tables.hhea || !tables.name) return [];
    const names = new Set(), name = tables.name, storage = name + buffer.readUInt16BE(name + 4);
    for (let i = 0; i < buffer.readUInt16BE(name + 2); i++) {
      const record = name + 6 + i * 12, platform = buffer.readUInt16BE(record), id = buffer.readUInt16BE(record + 6);
      if (![1, 16].includes(id) || ![0, 1, 3].includes(platform)) continue;
      const start = storage + buffer.readUInt16BE(record + 10), length = buffer.readUInt16BE(record + 8);
      let value = Buffer.from(buffer.subarray(start, start + length));
      const family = platform === 1 ? value.toString('latin1') : value.swap16().toString('utf16le');
      names.add(family.toLowerCase());
    }
    const units = buffer.readUInt16BE(tables.head + 18);
    let ascender = buffer.readInt16BE(tables.hhea + 4), descender = buffer.readInt16BE(tables.hhea + 6);
    const os2 = tables['OS/2'];
    if (os2 && buffer.readUInt16BE(os2) >= 4 && (buffer.readUInt16BE(os2 + 62) & 128)) {
      ascender = buffer.readInt16BE(os2 + 68); descender = buffer.readInt16BE(os2 + 70);
    }
    return [{ families: [...names], weight: os2 ? buffer.readUInt16BE(os2 + 4) : 400, ratio: (ascender - descender) / units }];
  });
}
function installedFonts() {
  if (catalog) return catalog;
  catalog = [];
  const roots = process.platform === 'win32'
    ? [path.join(process.env.WINDIR || 'C:/Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA || os.homedir(), 'Microsoft/Windows/Fonts')]
    : ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts'), '/System/Library/Fonts', '/Library/Fonts'];
  function visit(directory) {
    let entries; try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(ttf|otf|ttc)$/i.test(entry.name)) {
        try { catalog.push(...readFontFaces(fs.readFileSync(file))); } catch { /* Ignore unsupported font formats. */ }
      }
    }
  }
  roots.forEach(visit);
  return catalog;
}
function getAssFontMetrics(family, weight) {
  const families = String(family).split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
  const aliases = { 'sans-serif': 'arial', serif: 'times new roman', monospace: 'courier new', 'system-ui': process.platform === 'win32' ? 'segoe ui' : 'arial' };
  // CSS selects the installed bold face for Arial/Georgia's 600 weight. ASS
  // numeric b600 instead selects their regular face on DirectWrite.
  const target = weight >= 600 ? 700 : 400;
  for (const name of families) {
    const choices = installedFonts().filter(font => font.families.includes(fontconfigFamily(aliases[name] || name, target)));
    if (!choices.length) continue;
    const font = choices.reduce((a, b) => Math.abs(a.weight-target) <= Math.abs(b.weight-target) ? a : b);
    return { ratio: font.ratio, weight: target };
  }
  return { ratio: 1, weight: target };
}
module.exports = { getAssFontMetrics, readFontFaces };
