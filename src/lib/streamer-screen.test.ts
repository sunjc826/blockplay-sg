import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { readStreamerScreen, clickStreamerAction } from './streamer-screen';

const require = createRequire(import.meta.url);
const url = 'https://blockplay.test/';
function domFactory(): ((html:string)=>Document) | undefined {
  try {
    const {JSDOM} = require('jsdom');
    return html => new JSDOM(html,{url}).window.document;
  } catch {
    // Offline checkouts can also use the DOM implementation in the local pnpm tool cache.
    try {
      const domino = require('@mixmark-io/domino');
      return html => domino.createWindow(html,url).document;
    } catch { return undefined; }
  }
}
const documentFor = domFactory();
const button = (id:string,extra='') => '<button data-ai-action="'+id+'" data-ai-kind="select" '+extra+'>'+id+'</button>';
const page = (content:string) => '<main data-ai-solo><section data-ai-screen="store" data-ai-title="Field exchange">'+content+'</section></main>';
describe.skipIf(!documentFor)('declared streamer controls in an HTML document',()=>{
  it('reads bounded accessible names, availability and prices exclusively from safe declared controls',()=>{
    const doc = documentFor!(page('<span id="rent-label">Rent the rig</span>'+button('rig','aria-labelledby="rent-label" data-ai-detail="400 CR"')+
      button('locked','disabled')+button('issued','aria-pressed="true"')+
      '<button>Reset profile</button><div hidden>'+button('hidden')+'</div><div inert>'+button('inert')+'</div>'+
      '<details><summary>Settings</summary>'+button('closed')+'</details>'+
      '<a data-ai-action="external" data-ai-kind="navigate" href="https://other.test/">Outside</a>'+
      '<a data-ai-action="rooms" data-ai-kind="navigate" href="/play/multiplayer">Rooms</a>'));
    expect(readStreamerScreen(doc)).toEqual({screenId:'store',title:'Field exchange',actions:[
      {id:'rig',label:'Rent the rig',kind:'select',detail:'400 CR'},{id:'locked',label:'locked',kind:'select',state:'disabled'},
      {id:'issued',label:'issued',kind:'select',state:'selected'}]});
  });
  it('restricts interaction to the foreground screen and fails closed for blockers and duplicate IDs',()=>{
    expect(readStreamerScreen(documentFor!(button('unsafe')))).toBeNull();
    expect(readStreamerScreen(documentFor!(page('<div data-ai-loading></div>')))).toBeNull();
    expect(()=>readStreamerScreen(documentFor!(page(button('x')+button('x'))))).toThrow('Ambiguous');
    expect(()=>readStreamerScreen(documentFor!(page(button('play'))+'<div aria-modal="true"></div>'))).toThrow('player input');
    const modal='<div role="dialog" aria-modal="true" data-ai-screen="locker" data-ai-title="Locker">'+button('save')+'</div>';
    expect(readStreamerScreen(documentFor!(page(button('play')+modal)))?.actions.map(a=>a.id)).toEqual(['save']);
    expect(readStreamerScreen(documentFor!(page(Array.from({length:45},(_,i)=>button('item-'+i)).join(''))))?.actions).toHaveLength(40);
  });
  it('rejects a decision whose price or availability changed before the actor clicked',async()=>{
    const doc=documentFor!(page(button('rent','data-ai-detail="100 CR"'))), screen=readStreamerScreen(doc)!;
    doc.querySelector('button')!.setAttribute('data-ai-detail','200 CR');
    const commit=vi.fn();
    await expect(clickStreamerAction(doc,screen,'rent',new AbortController().signal,vi.fn(),commit)).rejects.toThrow('changed');
    expect(commit).not.toHaveBeenCalled();
  });
});

it.skipIf(!documentFor)('clicks only the revalidated visible control after the cursor arrives',async()=>{
  const doc=documentFor!(page(button('rent'))), control=doc.querySelector('button')!, screen=readStreamerScreen(doc)!;
  Object.defineProperties(control,{
    scrollIntoView:{value:vi.fn()},
    getBoundingClientRect:{value:()=>({left:20,top:10,width:40,height:20})},
  });
  Object.defineProperty(doc,'elementFromPoint',{value:()=>control,configurable:true});
  vi.stubGlobal('window',{matchMedia:()=>({matches:true})});
  const click=vi.fn(),point=vi.fn(),caption=vi.fn();
  control.addEventListener('click',click);
  try {
    await clickStreamerAction(doc,screen,'rent',new AbortController().signal,point,caption);
    expect(point).toHaveBeenCalledWith(40,20);expect(click).toHaveBeenCalledOnce();expect(caption).toHaveBeenCalledOnce();
    Object.defineProperty(doc,'elementFromPoint',{value:()=>doc.body});
    await expect(clickStreamerAction(doc,screen,'rent',new AbortController().signal,point,caption)).rejects.toThrow('covered');
    expect(click).toHaveBeenCalledOnce();expect(caption).toHaveBeenCalledOnce();
  } finally {vi.unstubAllGlobals();}
});
