import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CalendarHeatmap, Heatmap } from "../dist/index.js";

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const slots = (html) => [...html.matchAll(/class="heatmap__cell-slot" style="([^"]*)"/g)].map((m) => m[1]);
const cells = (html) => [...html.matchAll(/class="heatmap__cell" style="([^"]*)"/g)].map((m) => m[1]);

test("cellSize still draws square cells", () => {
  const html = render(Heatmap, { rows: 1, columns: 2, cellSize: 10, gap: 2, values: [[1, 2]] });
  assert.match(slots(html)[1], /left:12px;top:0;width:10px;height:10px/);
  assert.match(html, /heatmap__grid" style="width:22px;height:10px"/);
});

test("cellWidth and cellHeight size each axis independently", () => {
  const html = render(Heatmap, {
    rows: 2, columns: 3, cellSize: 13, cellWidth: 5, cellHeight: 16, gap: 2,
    values: [[1, 2, 3], [4, 5, 6]],
  });
  assert.match(slots(html)[4], /left:7px;top:18px;width:5px;height:16px/);
  // 3 columns of 5 with 2 gaps; 2 rows of 16 with 1 gap.
  assert.match(html, /heatmap__grid" style="width:19px;height:34px"/);
  assert.match(cells(html)[0], /width:5px;height:16px/);
});

test("a thin rounded cell takes its radius from the shorter side", () => {
  const html = render(Heatmap, { rows: 1, columns: 1, cellWidth: 10, cellHeight: 30, values: [[1]] });
  assert.match(cells(html)[0], /border-radius:2px/);
});

test("circles stay round in a non-square slot", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 1, shape: "circle", cellWidth: 20, cellHeight: 10, values: [[1]],
  });
  assert.match(cells(html)[0], /width:10px;height:10px/);
});

test("bar grows along the cell height", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 1, shape: "bar", cellWidth: 4, cellHeight: 20, levels: 4, values: [[1]],
  });
  assert.match(cells(html)[0], /width:4px;height:20px/);
});

test("cellColor overrides the ramp and falls back when undefined", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 3, colors: ["#aaaaaa", "#bbbbbb"], emptyColor: "#eeeeee",
    values: [[0, 50, 100]],
    cellColor: (cell) => (cell.value === 0 ? "#ff0000" : cell.value === 100 ? undefined : "#00ff00"),
  });
  const [outage, degraded, fine] = cells(html);
  assert.match(outage, /background:#ff0000/);
  assert.match(degraded, /background:#00ff00/);
  assert.match(fine, /background:#bbbbbb/);
});

test("the calendar spaces month labels by cellWidth", () => {
  const values = [{ date: "2026-09-07", value: 1 }];
  const wide = render(CalendarHeatmap, { to: "2026-09-07", weeks: 20, values, cellWidth: 30 });
  const narrow = render(CalendarHeatmap, { to: "2026-09-07", weeks: 20, values, cellWidth: 3, gap: 1 });
  const count = (html) => (html.match(/heatmap__column-label"/g) || []).length;
  assert.ok(count(wide) > count(narrow));
});

test("a labelled cell has a role that permits its aria-label", () => {
  const values = [[1, 2]];
  const labelled = render(Heatmap, { rows: 1, columns: 2, values, cellLabel: (cell) => `Value ${cell.value}` });
  assert.match(labelled, /role="img" aria-label="Value 1"/);
  const clickable = render(Heatmap, { rows: 1, columns: 2, values, cellLabel: () => "Cell", onCellClick: () => {} });
  assert.match(clickable, /role="button" aria-label="Cell"/);
  const plain = render(Heatmap, { rows: 1, columns: 2, values });
  assert.doesNotMatch(plain, /heatmap__cell-slot"[^>]*role=/);
});

const placeholders = (html) => (html.match(/data-placeholder="true"/g) || []).length;

test("a placeholder slot is drawn but holds no data", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 4, values: [[1, 2, 100, null]],
    // The 100 would otherwise take the top band to itself.
    isSlotPlaceholder: (_row, column) => column >= 2,
  });
  assert.equal(placeholders(html), 2);
  assert.equal(cells(html).length, 2);
  // Neither the placeholder's value nor its missing one is counted.
  assert.match(html, /data-total="3"/);
  assert.doesNotMatch(html, /slots with no data/);
  assert.match(html, /data-level="4"/);
  // Nothing to announce and nothing to focus.
  assert.match(html, /data-placeholder="true" aria-hidden="true"/);
  const placeholderSlot = html.slice(html.indexOf("data-placeholder"));
  assert.doesNotMatch(placeholderSlot.slice(0, placeholderSlot.indexOf("</div></div>")), /tabindex/);
});

test("a hidden slot wins over a placeholder", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 2, values: [[1, 1]],
    isSlotHidden: (_row, column) => column === 1,
    isSlotPlaceholder: () => true,
  });
  assert.equal(placeholders(html), 1);
  assert.equal((html.match(/heatmap__cell-slot/g) || []).length, 1);
});

test("a placeholder keeps the cell's shape and size", () => {
  const rounded = render(Heatmap, {
    rows: 1, columns: 1, cellSize: 20, isSlotPlaceholder: () => true,
  });
  assert.match(rounded, /class="heatmap__placeholder" style="border-radius:22%;width:20px;height:20px"/);
  assert.doesNotMatch(rounded, /<svg/);

  // A clipped shape cannot hold a border, so it is outlined with its own polygon.
  const diamond = render(Heatmap, {
    rows: 1, columns: 1, cellSize: 20, shape: "diamond", isSlotPlaceholder: () => true,
  });
  assert.match(diamond, /clip-path:polygon\(50% 0%, 100% 50%, 50% 100%, 0% 50%\)/);
  assert.match(diamond, /heatmap__placeholder-outline[^>]*viewBox="0 0 20 20"/);
  assert.match(diamond, /<polygon points="10,0 20,10 10,20 0,10"/);
});

test("a current cell is ringed and marked current", () => {
  const html = render(Heatmap, {
    rows: 1, columns: 3, values: [[1, 2, 3]],
    isCellCurrent: (cell) => cell.column === 1,
  });
  assert.equal((html.match(/data-current="true"/g) || []).length, 1);
  assert.match(html, /data-level="\d" data-current="true" aria-current="true"/);

  const hexagon = render(Heatmap, {
    rows: 1, columns: 1, shape: "hexagon", cellSize: 20, values: [[1]],
    isCellCurrent: () => true,
  });
  assert.match(hexagon, /heatmap__current-ring/);
});

test("depth is opt-in and scales with the cell", () => {
  const flat = render(Heatmap, { rows: 1, columns: 1, values: [[1]] });
  assert.doesNotMatch(flat, /data-depth/);

  const small = render(Heatmap, { rows: 1, columns: 1, depth: true, values: [[1]] });
  assert.match(small, /data-depth="true" style="--heatmap-depth-size:1px"/);
  const large = render(Heatmap, { rows: 1, columns: 1, depth: true, cellSize: 56, values: [[1]] });
  assert.match(large, /--heatmap-depth-size:5px/);
  // A caller's own style still wins.
  const custom = render(Heatmap, {
    rows: 1, columns: 1, depth: true, style: { "--heatmap-depth-size": "6px" }, values: [[1]],
  });
  assert.match(custom, /--heatmap-depth-size:6px/);
});
