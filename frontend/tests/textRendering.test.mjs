import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import ts from "typescript";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const layout = JSON.parse(fs.readFileSync(path.join(root, "frontend/lib/textLayout.json"), "utf8"));

function load(file, dependencies, transpile = true) {
  let code = fs.readFileSync(path.join(root, file), "utf8");
  if (transpile) code = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "exports", "module", code)(name => {
    if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name);
    return dependencies[name];
  }, loaded.exports, loaded);
  return loaded.exports;
}

function preview(props) {
  const cells = []; let index = 0;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useRef(initial) { const i = index++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; },
    useState(initial) { const i = index++; if (!(i in cells)) cells[i] = initial; return [cells[i], next => { cells[i] = next; }]; },
  };
  const component = load("frontend/components/editor/EditableTextOverlay.tsx", {
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "@/lib/textLayout.json": layout,
    "@/composables/useEditableTextDrag": { useEditableTextDrag: () => ({}) },
    "@/composables/useEditableTextResize": { useEditableTextResize: () => ({}) },
  }).default;
  return () => { index = 0; return component({ text: "Hi everyone", x: 50, y: 50, onTextChange() {}, onPositionChange() {}, onFontSizeChange() {}, ...props }); };
}

async function exportText(items) {
  let ass, args;
  const controller = load("backend/controllers/exportController.js", {
    "node:fs": { mkdirSync() {}, renameSync() {}, writeFileSync(file, value) { if(file.endsWith(".ass")) ass = value; } },
    "../utils/clipAnimationFilter": require("../../backend/utils/clipAnimationFilter"),
    "../utils/mediaLayout": require("../../backend/utils/mediaLayout"),
    "node:path": path, "node:crypto": { randomUUID: () => "test-export" },
    "node:child_process": { spawn(_binary, values) { args = values; const child = new EventEmitter(); child.stderr = new EventEmitter(); return child; } },
    sequelize: { Op: { in: Symbol("in") } },
    "../../frontend/lib/textLayout.json": layout,
    "../models/TimelineItem": { findAll: async () => items },
    "../models/Media": {},
  }, false);
  let status;
  const response = { status(value) { status = value; return this; }, json() { return this; } };
  await controller.createExport({ body: { projectId: "66ec12e5-244b-43e2-b36e-57bec761ade8" } }, response);
  assert.equal(status, 202);
  return { ass, args };
}

const cases = [
  { name: "centered size 34", x: 50, y: 50, size: 34, style: "subtitle" },
  { name: "bottom center", x: 50, y: 90, size: 34, style: "subtitle" },
  { name: "heading default", x: 50, y: 50, size: 48, style: "heading", defaultSize: true },
  { name: "moved text", x: 25, y: 70, size: 34, style: "subtitle" },
  { name: "resized text", x: 65, y: 80, size: 68, style: "subtitle" },
];
for (const sample of cases) {
  test(sample.name + " has consistent preview/export ratios on a 16:9 canvas", async () => {
    const row = { item_type: "TEXT", text_content: "Test description", text_style: sample.style,
      text_x: sample.x, text_y: sample.y, font_size: sample.defaultSize ? null : sample.size,
      font_weight: 700, font_family: "Georgia", text_color: "#123456", start_time: 1, duration: 5 };
    const { ass, args } = await exportText([row]);
    assert.match(ass, /PlayResX: 1920/); assert.match(ass, /PlayResY: 1080/);
    assert.match(ass, /WrapStyle: 2/);
    assert.ok(ass.includes("\\an5\\q2\\b700\\pos(" + Math.round(sample.x / 100 * 1920) + "," + Math.round(sample.y / 100 * 1080) + ")"));
    const fields = ass.split("\n").find(line => line.trim().startsWith("Style: Text0,")).trim().split(",");
    assert.equal(fields[1], "Georgia"); assert.equal(fields[3], "&H00563412");
    const exportSize = Number(fields[2]); assert.equal(exportSize, sample.size * 1920 / layout.referenceWidth);
    const render = preview({ x: sample.x, y: sample.y, textStyle: sample.style, fontSize: sample.defaultSize ? undefined : sample.size, fontFamily: "Georgia", fontWeight: 700, textColor: "#123456" });
    const overlay = render(); const text = overlay.props.children[0];
    assert.equal(overlay.props.style.left, sample.x + "%"); assert.equal(overlay.props.style.top, sample.y + "%");
    assert.equal(overlay.props.style.transform, "translate(-50%, -50%)");
    assert.ok(text.props.style.fontSize.endsWith("cqw"));
    for (const width of [320, 640, 746]) {
      const height = width * 9 / 16;
      const previewSize = parseFloat(text.props.style.fontSize) * width / 100;
      assert.ok(Math.abs(previewSize / width - exportSize / 1920) < 1e-10);
      assert.ok(Math.abs((sample.y / 100 * height) / height - sample.y / 100) < 1e-10);
    }
    overlay.props.onDoubleClick({ stopPropagation() {} });
    assert.equal(render().props.children[0].props.style.fontSize, text.props.style.fontSize);
    assert.ok(args.includes("color=c=black:s=1920x1080:r=30:d=6"));
  });
}

test("each exported clip retains its own family, color, weight and size", async () => {
  const rows = [
    { item_type: "TEXT", text_content: "first", text_style: "subtitle", font_size: 34, font_weight: 400, font_family: "Arial", text_color: "#ff0000", start_time: 0, duration: 5 },
    { item_type: "TEXT", text_content: "second", text_style: "heading", font_size: 42, font_weight: 800, font_family: "Times New Roman", text_color: "#00ff00", start_time: 5, duration: 5 },
  ];
  const { ass } = await exportText(rows);
  assert.match(ass, /Style: Text0,Arial,102,&H000000FF/);
  assert.match(ass, /Style: Text1,Times New Roman,126,&H0000FF00/);
  assert.ok(ass.includes("\\b400\\pos(960,540)")); assert.ok(ass.includes("\\b800\\pos(960,540)"));
});

test("resize screen movement converts back to the same saved size at different canvas widths", () => {
  for (const width of [320, 640, 746]) {
    let saved;
    const { useEditableTextResize: runResizeHook } = load("frontend/composables/useEditableTextResize.ts", {
      react: { useRef: value => ({ current: value }) }, "@/lib/textLayout.json": layout,
    });
    const hook = runResizeHook({ fontSize: 34, setSelected() {}, onFontSizeChange: value => { saved = value; } });
    const target = { setPointerCapture() {}, parentElement: { parentElement: { getBoundingClientRect: () => ({ width }) } } };
    const event = { clientX: 0, clientY: 0, pointerId: 1, currentTarget: target, preventDefault() {}, stopPropagation() {} };
    hook.handleResizePointerDown(event);
    const delta = 40 * width / layout.referenceWidth;
    hook.handleResizePointerMove({ ...event, clientX: delta, clientY: delta });
    assert.equal(saved, 44);
  }
});

test("dragging keeps normalized coordinates across responsive previews", () => {
  for (const width of [320, 640]) {
    let saved;
    const { useEditableTextDrag: runDragHook } = load("frontend/composables/useEditableTextDrag.ts", { react: { useRef: value => ({ current: value }) } });
    const hook = runDragHook({ x: 50, y: 50, editing: false, setSelected() {}, onPositionChange: (x, y) => { saved = [x, y]; } });
    const target = { setPointerCapture() {}, parentElement: { getBoundingClientRect: () => ({ width, height: width * 9 / 16 }) }, getBoundingClientRect: () => ({ width: 40, height: 20 }) };
    const event = { clientX: 0, clientY: 0, pointerId: 1, currentTarget: target, preventDefault() {}, stopPropagation() {} };
    hook.handlePointerDown(event);
    hook.handlePointerMove({ ...event, clientX: width * 0.1, clientY: width * 9 / 16 * 0.2 });
    assert.deepEqual(saved, [60, 70]);
  }
});
