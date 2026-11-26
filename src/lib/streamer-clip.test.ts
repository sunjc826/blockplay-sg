import { afterEach, expect, it, vi } from 'vitest';
import { createClipRecorder, type ClipState } from './streamer-clip';

function capture() {
  const video = Object.assign(new EventTarget(), {readyState:'live', stop:vi.fn()});
  const audio = {stop:vi.fn()};
  return {video, audio, stream:{getVideoTracks:()=>[video], getAudioTracks:()=>[audio], getTracks:()=>[video,audio]}};
}

class TestRecorder {
  static current: TestRecorder;
  state = 'inactive';
  mimeType = 'video/mp4';
  onstart?: () => void;
  onstop?: () => void;
  ondataavailable?: (e:{data:Blob}) => void;
  constructor(readonly stream: MediaStream) { TestRecorder.current = this; }
  start() { this.state = 'recording'; queueMicrotask(() => this.onstart?.()); }
  stop() { this.state = 'inactive'; }
  finish() {
    this.ondataavailable?.({data:new Blob(['final chunk'],{type:this.mimeType})});
    this.onstop?.();
  }
}

function setup() {
  const source = capture();
  const getDisplayMedia = vi.fn().mockResolvedValue(source.stream);
  vi.stubGlobal('navigator',{mediaDevices:{getDisplayMedia}});
  vi.stubGlobal('MediaRecorder',TestRecorder);
  const update = vi.fn<(state: ClipState) => void>();
  const recorder = createClipRecorder(update);
  return {source,getDisplayMedia,recorder,update};
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('uses the final chunk after sharing ends and keeps the MP4 available until dismissed', async () => {
  const {source,recorder,update} = setup();
  const revoke = vi.spyOn(URL,'revokeObjectURL');
  await recorder.start('pro');
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({phase:'recording',audio:true}));
  source.video.dispatchEvent(new Event('ended'));
  expect(update).toHaveBeenLastCalledWith({phase:'finishing'});
  TestRecorder.current.finish();
  const clip = update.mock.lastCall![0];
  if (clip.phase !== 'ready') throw new Error('Missing clip');
  expect(clip.filename).toMatch(/^blockplay-pro-.*\.mp4$/);
  expect(await (await fetch(clip.url)).text()).toBe('final chunk');
  expect(source.audio.stop).toHaveBeenCalledOnce();
  recorder.stop();
  expect(revoke).not.toHaveBeenCalled();
  recorder.dismiss();
  expect(revoke).toHaveBeenCalledWith(clip.url);
});

it('releases a late picker result after the session stops, even during a new recording', async () => {
  const {source,getDisplayMedia,recorder,update} = setup();
  let grant!: (stream:unknown) => void;
  getDisplayMedia.mockImplementationOnce(()=>new Promise(resolve=>{grant=resolve;}));
  const pending = recorder.start('pro');
  await recorder.start('pro');
  expect(getDisplayMedia).toHaveBeenCalledTimes(1);
  recorder.stop();
  const next = capture();
  getDisplayMedia.mockResolvedValueOnce(next.stream);
  await recorder.start('rager');
  grant(source.stream);
  await pending;
  expect(source.video.stop).toHaveBeenCalledOnce();
  expect(next.video.stop).not.toHaveBeenCalled();
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({phase:'recording'}));
  recorder.dispose();
  expect(next.video.stop).toHaveBeenCalledOnce();
});

it('recovers from denied permission and releases every track if the encoder cannot start', async () => {
  const {source,getDisplayMedia,recorder,update} = setup();
  getDisplayMedia.mockRejectedValueOnce(new DOMException('Dismissed','NotAllowedError'));
  await recorder.start('pro');
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({phase:'error'}));
  recorder.dismiss();
  vi.spyOn(TestRecorder.prototype,'start').mockImplementationOnce(()=>{throw new Error('Encoder unavailable');});
  await recorder.start('pro');
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({phase:'error'}));
  expect(source.video.stop).toHaveBeenCalledOnce();
  expect(source.audio.stop).toHaveBeenCalledOnce();
});
