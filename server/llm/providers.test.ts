import { it, expect, vi } from 'vitest';
import { selectModel, estimate } from './index';
import type { Completion } from './types';
const r: Completion = {model:'test',system:['one','two'],user:'state',image:{mediaType:'image/jpeg',base64:'/9j/'},schemaName:'cast',schema:{type:'object'},effort:'low',maxOutputTokens:2000};
for (const provider of ['openai','anthropic']) {
  const make = (response: object,status = 200) => {
    const fetcher = vi.fn(async (_url:unknown,_init?:RequestInit)=>Response.json(response,{status,headers:{'x-should-retry':'false'}}));
    return {fetcher,complete:selectModel({CAST_PROVIDER:provider,OPENAI_API_KEY:'test',ANTHROPIC_API_KEY:'test'},'CAST',fetcher).complete!};
  };
  const a = provider === 'anthropic';
  it(provider+' sends structured text and image and normalizes usage',async()=>{
    const {complete,fetcher} = make(a ? {content:[{type:'thinking'},{type:'text',text:'{"ok":true}'}],stop_reason:'end_turn',usage:{input_tokens:4,cache_creation_input_tokens:3,cache_read_input_tokens:2,output_tokens:5}} :
      {output:[{content:[{type:'output_text',text:'{"ok":true}'}]}],usage:{input_tokens:9,input_tokens_details:{cached_tokens:2},output_tokens:5}});
    expect(await complete(r)).toMatchObject({json:{ok:true},usage:{inputTokens:9,cachedInputTokens:2,outputTokens:5}});
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    if (a) {
      expect(body).toEqual({model:'test',max_tokens:2000,system:[{type:'text',text:'one'},{type:'text',text:'two',cache_control:{type:'ephemeral'}}],
        messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:'/9j/'}},{type:'text',text:'state'}]}],
        output_config:{effort:'low',format:{type:'json_schema',schema:r.schema}}});
    } else {
      expect(body.instructions).toBe('one\n\ntwo'); expect(body.text.format.strict).toBe(true);
      expect(body.input[0].content[1].image_url).toBe('data:image/jpeg;base64,/9j/');
    }
  });
  it(provider+' distinguishes refusal, truncation, auth and rate limits',async()=>{
    expect((await make(a ? {stop_reason:'refusal',usage:{},content:[]} : {output:[{content:[{type:'refusal'}]}]}).complete(r)).json).toBeNull();
    await expect(make(a ? {stop_reason:'max_tokens'} : {status:'incomplete'}).complete(r)).rejects.toMatchObject({status:502});
    for (const [code,status] of [[401,503],[429,429],[500,502]]) await expect(make({},code).complete(r)).rejects.toMatchObject({status});
  });
}
it('prices only known models and separates cached input',()=>{
  const usage = {inputTokens:1000000,cachedInputTokens:500000,outputTokens:100000};
  expect(estimate('claude-sonnet-5-5',usage)).toBe(2.05); expect(estimate('unknown',usage)).toBeUndefined();
});
