'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function fixture(stored, reject = false) {
  const events = {}, docEvents = {}, windowEvents = {}, values = {};
  const video = { style: {}, paused: true, calls: 0, pause() { this.paused = true; }, async play() { this.calls++; if (reject) throw Error('autoplay'); this.paused = false; }, addEventListener(n, fn) { events[n] = fn; } };
  const toggle = { addEventListener(n, fn) { events['toggle-' + n] = fn; } }, status = {};
  const document = { body: { dataset: {} }, hidden: false, getElementById: id => ({ backgroundVideo: video, animatedBackground: toggle, backgroundStatus: status })[id], addEventListener(n, fn) { docEvents[n] = fn; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ui/background.js'), 'utf8'), { document, window: { addEventListener(n, fn) { windowEvents[n] = fn; } }, localStorage: { getItem: () => stored, setItem: (k, v) => { values[k] = v; } } });
  return { video, toggle, status, document, events, docEvents, windowEvents, values };
}
test('background starts muted, pauses when hidden and resumes when visible', async () => {
  const f = fixture(null); await new Promise(setImmediate);
  assert.equal(f.video.calls, 1); assert.equal(f.video.muted, true); assert.equal(f.video.loop, true);
  f.document.hidden = true; f.docEvents.visibilitychange(); assert.equal(f.video.paused, true);
  f.document.hidden = false; f.docEvents.visibilitychange(); await new Promise(setImmediate); assert.equal(f.video.paused, false);
});
test('background respects saved pause and can be enabled from settings', async () => {
  const f = fixture('false'); assert.equal(f.video.calls, 0);
  f.toggle.checked = true; f.events['toggle-change'](); await new Promise(setImmediate);
  assert.equal(f.video.calls, 1); assert.equal(f.values['mantis.animatedBackground'], 'true');
});
test('blocked playback displays a message and pointer interaction retries', async () => {
  const f = fixture(null, true); await new Promise(setImmediate);
  assert.match(f.status.textContent, /reintentar/);
  f.windowEvents.pointerdown(); await new Promise(setImmediate); assert.equal(f.video.calls, 2);
  f.events.error(); assert.match(f.status.textContent, /parche/);
});
