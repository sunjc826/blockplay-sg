import { expect, it } from 'vitest';
import { advanceSprintBreak, createSprintBreak, SPRINT_OUT, SPRINT_RESUME } from './fps-sprint';

const frame = 1 / 60;

it('sprints untouched while the trigger is not pulled', () => {
  const state = createSprintBreak();
  expect(advanceSprintBreak(state, true, false, true, frame)).toEqual({ sprint: true, fire: false });
  expect(advanceSprintBreak(state, false, false, false, frame)).toEqual({ sprint: false, fire: false });
});
it('drops a sprint the moment the trigger is pulled and fires once the gun is up', () => {
  const state = createSprintBreak();
  expect(advanceSprintBreak(state, true, true, true, frame)).toEqual({ sprint: false, fire: false });
  let wait = frame, step = advanceSprintBreak(state, true, true, false, frame);
  while (!step.fire) { wait += frame; step = advanceSprintBreak(state, true, true, false, frame); }
  expect(step.sprint).toBe(false);
  expect(wait).toBeGreaterThanOrEqual(SPRINT_OUT - 1e-9);
  expect(wait).toBeLessThan(SPRINT_OUT + 2 * frame);
});
it('fires at once when the player was not sprinting', () => {
  expect(advanceSprintBreak(createSprintBreak(), false, true, false, frame).fire).toBe(true);
  // Still asking to sprint, but inside the resume window, so the run never came back.
  const state = createSprintBreak();
  advanceSprintBreak(state, true, true, true, frame);
  for (let t = 0; t < SPRINT_OUT; t += frame) advanceSprintBreak(state, true, true, false, frame);
  advanceSprintBreak(state, true, false, false, frame);
  expect(advanceSprintBreak(state, true, true, false, frame)).toEqual({ sprint: false, fire: true });
});
it('picks the sprint back up on its own once the trigger has been let go a moment', () => {
  const state = createSprintBreak();
  advanceSprintBreak(state, true, true, true, frame);
  let waited = 0, step = advanceSprintBreak(state, true, false, false, frame);
  while (!step.sprint) { waited += frame; step = advanceSprintBreak(state, true, false, false, frame); }
  expect(waited).toBeGreaterThanOrEqual(SPRINT_RESUME - 2 * frame);
  expect(waited).toBeLessThan(SPRINT_RESUME + frame);
});
it('ignores a broken clock', () => {
  const state = createSprintBreak();
  advanceSprintBreak(state, true, true, true, frame);
  expect(advanceSprintBreak(state, true, true, false, Number.NaN).fire).toBe(false);
  expect(state.raise).toBe(SPRINT_OUT);
});
