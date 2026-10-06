import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function load(file, dependencies, transpile = true) {
  let code = fs.readFileSync(path.join(root, file), "utf8");
  if (transpile) code = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "exports", "module", code)(name => {
    if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name);
    return dependencies[name];
  }, loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

function fixture() {
  const projectId = randomUUID();
  const mediaId = randomUUID();
  const rows = [];
  const requests = [];
  const actions = [];
  const media = { id: mediaId, media_type: "video", duration_seconds: 60, original_name: "clip", file_url: "/clip.mp4", file_size: 100 };
  const controller = load("backend/controllers/timelineController.js", {
    "../../frontend/lib/mediaAnimation": require("../lib/mediaAnimation"),
    "../models/AnimationOption": {findOne: async () => ({is_active:true})},
    sequelize: { Op: { in: Symbol("in") } },
    "../models/Project": { findByPk: async id => ({ id }) },
    "../models/Media": { findByPk: async () => media, findAll: async () => [media] },
    "../models/TimelineItem": {
      create: async values => {
        assert.equal(values.id, undefined, "client must not supply an ID");
        const row = { animation_preset:"none", animation_amount:50, ...values, id: randomUUID(), async update(values) {Object.assign(this,values);return this;} };
        rows.push(row); return row;
      },
      findAll: async () => rows,
      findByPk: async id => rows.find(row=>row.id===id),
    },
  }, false);
  const call = async (fn, req) => {
    let status, data;
    const res = { status(value) { status = value; return this; }, json(value) { data = value; return this; } };
    await fn(req, res);
    if (status >= 400) throw new Error(data.message);
    return { data };
  };
  const axios = { post: async (url, body) => {
    requests.push({ url, body });
    return call(controller.addTimelineItem, { body });
  }, patch: async (url,body) => call(controller.updateTimelineItem,{body,params:{id:url.split("/").at(-1)}}) };
  const { timelineService } = load("frontend/services/timelineService.ts", { axios });
  const cells = []; const cleanups = []; const effects = []; let index = 0; const listeners = new Set();
  const react = {
    useRef(value) { const i = index++; if (!(i in cells)) cells[i] = { current: value }; return cells[i]; },
    useState(value) { const i = index++; if (!(i in cells)) cells[i] = value; return [cells[i], next => { cells[i] = next; }]; },
    useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
  };
  const loadedModule = load("frontend/composables/useTimelineClipboard.ts", { react, "@/services/timelineService": { timelineService }, "@/reducers/timelineReducer": {} });
  let selectedId;
  let items = [];
  let options;
  global.window = { addEventListener: (_name, fn) => listeners.add(fn), removeEventListener: (_name, fn) => listeners.delete(fn) };
  global.HTMLElement = class { constructor(typing = false) { this.typing = typing; } closest() { return this.typing ? this : null; } };
  const source = { id: randomUUID(), type: "text", text: "Test description", textStyle: "subtitle", fontSize: 44, fontWeight: 700, fontFamily: "Georgia", textColor: "#abcdef", textX: 23, textY: 72, trackId: "titles", startTime: 0, duration: 5, sourceStart: 0, startPosition: 0, width: 10 };
  const render = (overrides = {}) => {
    cleanups.splice(0).forEach(fn => fn?.());
    index = 0;
    options = { projectId, items, selectedItem: source, playheadTime: 0, onSelectItem: id => { selectedId = id; }, dispatch: action => { actions.push(action); if (action.type === "ADD_ITEM_SUCCESS") items = [...items, action.payload]; }, ...options, ...overrides };
    options.items = items;
    const hook = loadedModule.useTimelineClipboard(options);
    effects.splice(0).forEach(fn => cleanups.push(fn()));
    return hook;
  };
  const key = (value, typing = false, extra = {}) => {
    const event = { key: value, ctrlKey: true, target: new HTMLElement(typing), preventDefault() { this.prevented = true; }, ...extra };
    listeners.forEach(fn => fn(event)); return event;
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return { source, clipboardModule: loadedModule, render, requests, rows, actions, key, settle, media, mediaId, projectId,
    setItems: values => { items = values; }, getItems: () => items, selectedId: () => selectedId,
    listenerCount: () => listeners.size,
    reload: () => call(controller.getTimelineItems, { query: { projectId }, protocol: "http", get: () => "localhost" }),
    dispose: () => { cleanups.splice(0).forEach(fn => fn?.()); delete global.window; delete global.HTMLElement; },
  };
}

test("duplicate preserves styling, avoids collisions, POSTs a new ID and survives API reload", async () => {
  const f = fixture();
  try {
    f.setItems([f.source, { ...f.source, id: randomUUID(), startTime: 5 }]);
    f.render().handleDuplicate(); await f.settle();
    assert.equal(f.requests.length, 1);
    assert.ok(f.requests[0].url.endsWith("/api/timeline/items"));
    assert.equal(f.requests[0].body.startTime, 10);
    const row = f.rows[0]; assert.notEqual(row.id, f.source.id);
    assert.equal(f.selectedId(), row.id);
    const { data } = await f.reload(); const reloaded = data.items[0];
    for (const field of ["textContent", "textStyle", "fontSize", "fontWeight", "fontFamily", "textColor", "textX", "textY"]) assert.equal(reloaded[field], f.requests[0].body[field]);
    assert.equal(reloaded.id, row.id); assert.equal(f.getItems().at(-1).id, row.id);
  } finally { f.dispose(); }
});

test("copy is a snapshot, paste uses playhead, repeated paste does not overlap", async () => {
  const f = fixture();
  try {
    f.setItems([f.source]);
    f.render({ playheadTime: 20 }); assert.equal(f.key("c").prevented, true); assert.equal(f.requests.length, 0);
    f.render({ selectedItem: { ...f.source, text: "changed later" } });
    f.key("v"); await f.settle(); f.key("v"); await f.settle();
    assert.deepEqual(f.requests.map(r => r.body.startTime), [20, 25]);
    assert.ok(f.requests.every(r => r.body.textContent === "Test description"));
    assert.notEqual(f.rows[0].id, f.rows[1].id);
    assert.equal(f.listenerCount(), 1);
  } finally { f.dispose(); }
});

for (const type of ["image", "video", "audio"]) {
  test(type + " duplicate preserves media reference, duration and source offset through reload", async () => {
    const f = fixture();
    try {
      f.media.media_type = type;
      const source = { ...f.source, type: "media", text: undefined, file: { id: f.mediaId, type, name: "clip" }, sourceStart: type === "image" ? 0 : 12 };
      f.setItems([source]); f.render({ selectedItem: source }).handleDuplicate(); await f.settle();
      assert.equal(f.requests[0].body.mediaId, f.mediaId);
      assert.equal(f.rows[0].source_start, source.sourceStart);
      assert.notEqual(f.rows[0].id, source.id);
      const { data } = await f.reload();
      assert.equal(data.items[0].sourceStart, source.sourceStart);
      assert.equal(data.items[0].duration, source.duration);
      assert.equal(data.items[0].media.id, f.mediaId);
    } finally { f.dispose(); }
  });
}

test("typing targets, composition and repeats keep native clipboard; listener cleans up", async () => {
  const f = fixture();
  try {
    f.render(); f.key("c");
    for (const target of ["input", "textarea", "select", "contenteditable descendant"]) {
      assert.equal(f.key("c", true).prevented, undefined, target);
      assert.equal(f.key("v", true).prevented, undefined, target);
    }
    assert.equal(f.key("v", false, { isComposing: true }).prevented, undefined);
    assert.equal(f.key("v", false, { repeat: true }).prevented, undefined);
    assert.equal(f.requests.length, 0);
    f.render({ selectedItem: null }); assert.equal(f.key("c").prevented, undefined);
    assert.equal(f.listenerCount(), 1);
  } finally { f.dispose(); }
  assert.equal(f.listenerCount(), 0);
});

test("in-flight duplicates create one item; rejected API requests do not add local clips", async () => {
  const f = fixture();
  try {
    f.setItems([f.source]); const hook = f.render(); hook.handleDuplicate(); hook.handleDuplicate(); await f.settle();
    assert.equal(f.requests.length, 1);
    f.render({ selectedItem: { ...f.source, fontSize: 999 } }).handleDuplicate(); await f.settle();
    assert.equal(f.rows.length, 1); assert.equal(f.getItems().length, 2);
    assert.equal(f.actions.at(-1).type, "ADD_ITEM_ERROR");
  } finally { f.dispose(); }
});

test("placement allows touching clips, fills a sufficient gap and ignores other tracks", () => {
  const f = fixture();
  try {
    const other = (startTime, duration, trackId = "titles") => ({ ...f.source, id: randomUUID(), startTime, duration, trackId });
    assert.equal(f.clipboardModule.findPasteStart([other(0, 5), other(10, 5), other(5, 100, "audio")], f.source, 5), 5);
    assert.equal(f.clipboardModule.findPasteStart([other(4, 3), other(9, 3)], f.source, 5), 12);
  } finally { f.dispose(); }
});

test('duplicate persists independent media phases through API reload',async()=>{
 const f=fixture();try {
  f.media.media_type='image';const source={...f.source,type:'media',file:{id:f.mediaId,type:'image',name:'clip'},animationInPreset:'zoom-in',animationInDuration:1,animationInAmount:50,animationOutPreset:'fade-out',animationOutDuration:1.5,animationOutAmount:100};
  f.setItems([source]);f.render({selectedItem:source}).handleDuplicate();await f.settle();
  const {data}=await f.reload();for(const key of ['animationInPreset','animationInDuration','animationInAmount','animationOutPreset','animationOutDuration','animationOutAmount'])assert.equal(data.items[0][key],source[key]);
 }finally{f.dispose();}
});
