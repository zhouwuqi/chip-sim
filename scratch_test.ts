import { compile } from './src/sim/compile';
import { Kernel } from './src/sim/kernel';
import type { Compiled, Component, ComponentKind, Dir } from './src/sim/types';

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, info = '') { if (cond) pass++; else { fail++; console.log(`  FAIL ${name} ${info}`); } }

// ---- 1. kernel MERGE/SPLIT round trip (manual netlist) ----
{
  const compiled: Compiled = {
    numNets: 9,
    gates: [], lamps: [], clocks: [], dffs: [], displays: [],
    sources: [0, 1, 2, 3].map((i) => ({ net: i, compId: i })),
    merges: [{ bits: [0, 1, 2, 3], out: 4 }],
    splits: [{ in: 4, bits: [5, 6, 7, 8] }],
    netOf: {},
  };
  let inputs = [0, 0, 0, 0];
  const k = new Kernel(compiled, (id) => inputs[id] === 1);
  for (let v = 0; v < 16; v++) {
    inputs = [v & 1, (v >> 1) & 1, (v >> 2) & 1, (v >> 3) & 1];
    for (let i = 0; i < 10; i++) k.tick();
    ok(`merge packs ${v}`, k.value(4) === v, `got ${k.value(4)}`);
    const bits = [k.value(5), k.value(6), k.value(7), k.value(8)];
    const unpacked = bits[0] | (bits[1] << 1) | (bits[2] << 2) | (bits[3] << 3);
    ok(`split unpacks ${v}`, unpacked === v, `got ${unpacked}`);
  }
}

// ---- 2. compile: bus terminals join only bus; 1-bit wire stays separate ----
{
  let id = 1;
  const mk = (kind: ComponentKind, x: number, y: number, f: Dir = 0): Component => ({ id: id++, kind, x, y, facing: f });
  const merge = mk('MERGE', 2, 0); // mout at (3,0)
  const bus = mk('BUS', 3, 0);
  const disp = mk('DISPLAY', 4, 0); // din west -> (3,0)
  const wire = mk('WIRE', 3, 1); // 1-bit, adjacent to bus at (3,0)
  const c = compile([merge, bus, disp, wire]);
  const mout = c.netOf[`${merge.id}:mout`];
  const busNet = c.netOf[`bus:${bus.id}`];
  const din = c.netOf[`${disp.id}:din`];
  const wireNet = c.netOf[`w:${wire.id}`];
  ok('merge out == bus net', mout === busNet);
  ok('display in == bus net', din === busNet);
  ok('1-bit wire NOT joined to bus', wireNet !== busNet);
  ok('one merge compiled', c.merges.length === 1 && c.merges[0].out === busNet);
  ok('one display compiled', c.displays.length === 1 && c.displays[0].net === busNet);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
