import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {JsonProviderCheckpointStore} from '../../src/live/basketball/checkpoint.js';
import {reconcileJournal} from '../../src/live/basketball/reconcile.js';
it('recovers an atomic durable checkpoint after restart and rejects corrupt authority',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'basketball-checkpoint-'));
 try{
  const path=join(directory,'checkpoint.json');const catalog={gameId:'g',teamIds:['h','a'],playerTeams:{}};
  const store=new JsonProviderCheckpointStore(path,catalog);expect(await store.load()).toBeNull();
  const checkpoint={provider:'synthetic',gameId:'external',cursor:'cursor-1',heartbeatAt:100,reconciled:true,...reconcileJournal(undefined,[],catalog)};
  await store.save(checkpoint);expect((await new JsonProviderCheckpointStore(path,catalog).load())?.cursor).toBe('cursor-1');
  const stored=JSON.parse(await readFile(path,'utf8'));stored.journal.resultVersion='forged';await writeFile(path,JSON.stringify(stored));await expect(store.load()).rejects.toThrow(/checkpoint/i);
 }finally{await rm(directory,{recursive:true,force:true});}
});
