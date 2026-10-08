const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

test('text controller lifecycle persists one clip per call, updates position, and deletes only its ID', async () => {
  const records = new Map();
  let nextId = 0;
  const TimelineItem = {
    async create(values) {
      const item = { ...values, id: 'clip-' + ++nextId,
        async update(updates) { Object.assign(this, updates); },
        async destroy() { records.delete(this.id); },
      };
      records.set(item.id, item);
      return item;
    },
    async findByPk(id) { return records.get(id); },
    async findAll({where}) { return [...records.values()].filter(i => i.project_id === where.project_id); },
  };
  const controllerPath = path.resolve(__dirname, '../controllers/timelineController.js');
  const realRequire = createRequire(controllerPath);
  const projectId = '11111111-1111-4111-8111-111111111111';
  const mocks = {'../models/TimelineItem':TimelineItem,'../models/Project':{findByPk:async id => ({id})},'../models/Media':{}};
  const loaded = {exports:{}};
  new Function('require','module','exports',fs.readFileSync(controllerPath,'utf8'))(name => mocks[name] ?? realRequire(name),loaded,loaded.exports);
  const controller = loaded.exports;
  async function request(handler, body = {}, id) {
    const response = {statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await handler({body,params:{id},query:{projectId}},response);
    return response;
  }
  const input = {projectId,itemType:'TEXT',textStyle:'title',textContent:'Title',trackId:'titles',startTime:0,duration:5};
  const keep = (await request(controller.addTimelineItem,input)).body.item;
  for (let cycle = 0; cycle < 5; cycle++) {
    const added = await request(controller.addTimelineItem,{...input,startTime:5});
    assert.equal(added.statusCode,201);
    assert.equal(records.size,2);
    const id = added.body.item.id;
    const moved = await request(controller.updateTimelineItem,{trackId:'titles',startTime:20+cycle,duration:8},id);
    assert.equal(moved.statusCode,200);
    const refreshed = await request(controller.getTimelineItems);
    assert.equal(refreshed.body.items.find(i=>i.id===id).startTime,20+cycle);
    assert.equal(refreshed.body.items.find(i=>i.id===id).duration,8);
    assert.equal((await request(controller.deleteTimelineItem,{},id)).statusCode,200);
    const reloaded = await request(controller.getTimelineItems);
    assert.deepEqual(reloaded.body.items.map(i=>i.id),[keep.id]);
    assert.equal((await request(controller.deleteTimelineItem,{},id)).statusCode,404);
  }
});
