import { expect, it } from 'vitest';
import { createInputReconciliation } from './input-reconciliation';

const point = (x: number) => ({ x, y: 1.75, z: 0 });

it('preserves all movement since an acknowledged input, irrespective of its age', () => {
  const prediction = createInputReconciliation();
  prediction.record(1, point(5));
  prediction.acknowledge(1, point(5));
  expect(prediction.correct(point(25), .016)).toBeNull();
});

it('eases a real error without discarding newer travel or correcting queued inputs twice', () => {
  const prediction = createInputReconciliation();
  prediction.record(1, point(5)); prediction.record(2, point(6));
  prediction.acknowledge(1, point(4));
  const first = prediction.correct(point(7), .1)!;
  expect(first.hard).toBe(false); expect(first.point.x).toBeGreaterThan(6); expect(first.point.x).toBeLessThan(7);
  prediction.acknowledge(2, point(5));
  let current = first.point;
  for (let i = 0; i < 15; i++) current = prediction.correct(current, .1)?.point ?? current;
  expect(current.x).toBeCloseTo(6, 2);
  // Inputs sent after correction include that offset and must not undo it.
  prediction.record(3, current); prediction.acknowledge(3, current);
  expect(prediction.correct(current, .1)).toBeNull();
});

it('applies a large rejected move once and ignores duplicate or reordered acknowledgements', () => {
  const prediction = createInputReconciliation();
  prediction.record(1, point(0)); prediction.record(2, point(50));
  prediction.acknowledge(2, point(8));
  expect(prediction.correct(point(52), .016)).toEqual({ point: point(10), hard: true });
  prediction.acknowledge(1, point(-50)); prediction.acknowledge(2, point(-50));
  expect(prediction.correct(point(10), .016)).toBeNull();
});

it('bounds input history and waits for a matching acknowledgement after a long outage', () => {
  const prediction = createInputReconciliation();
  for (let i = 1; i <= 300; i++) prediction.record(i, point(i));
  prediction.acknowledge(1, point(-100));
  expect(prediction.correct(point(305), .016)).toBeNull();
  prediction.acknowledge(300, point(300));
  expect(prediction.correct(point(305), .016)).toBeNull();
});

it('discards pending corrections and input history on lifecycle changes', () => {
  const prediction = createInputReconciliation();
  prediction.record(1, point(50)); prediction.acknowledge(1, point(0));
  prediction.reset(); prediction.acknowledge(1, point(-100));
  expect(prediction.correct(point(10), .016)).toBeNull();
});
