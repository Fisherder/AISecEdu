import {createServer} from 'node:http';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {persistDurableModelEvent} from '@/lib/server/durable-model-events';
const event={attemptCount:1,type:'model.settled',callId:'job:1:1',detail:{text:'同一份答案'}};
afterEach(()=>vi.unstubAllGlobals());
describe('durable model event delivery',()=>{
  it('recovers a real closed socket without changing the committed event',async()=>{
    const bodies:string[]=[];
    const server=createServer(async(request,response)=>{
      let body='';for await(const chunk of request)body+=chunk;
      bodies.push(body);
      if(bodies.length===1){request.socket.destroy();return}
      response.setHeader('Content-Type','application/json');response.end('{"accepted":true,"duplicate":true}');
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
      const port=(server.address() as {port:number}).port;
      await persistDurableModelEvent(`http://127.0.0.1:${port}/model-events`,{},event);
      expect(bodies).toHaveLength(2);expect(bodies[0]).toBe(bodies[1]);
    } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
  });
  it('retries only the identical event after a lost commit response and drains the acknowledgement',async()=>{
    const response=new Response('{"accepted":true,"duplicate":true}');
    const consume=vi.spyOn(response,'arrayBuffer');
    const fetch=vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(response);
    vi.stubGlobal('fetch',fetch);
    await persistDurableModelEvent('http://receiver/model-events',{},event);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect(consume).toHaveBeenCalledOnce();
  });
  it('does not retry contract, permission or lease rejection',async()=>{
    const fetch=vi.fn(async()=>new Response('{}',{status:409}));vi.stubGlobal('fetch',fetch);
    await expect(persistDurableModelEvent('http://receiver/model-events',{},event)).rejects.toThrow('HTTP 409');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('bounds service failure retries instead of generating a new model answer',async()=>{
    const fetch=vi.fn(async()=>new Response('{}',{status:503}));vi.stubGlobal('fetch',fetch);
    await expect(persistDurableModelEvent('http://receiver/model-events',{},event)).rejects.toThrow('HTTP 503');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('honors an already cancelled execution without making an HTTP request',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const controller=new AbortController();controller.abort(new Error('stopped'));
    await expect(persistDurableModelEvent('http://receiver/model-events',{},event,{signal:controller.signal})).rejects.toThrow('stopped');
    expect(fetch).not.toHaveBeenCalled();
  });
});
