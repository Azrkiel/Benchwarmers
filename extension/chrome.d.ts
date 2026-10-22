declare namespace chrome {
  namespace runtime {
    const id:string;
    interface Sender { id?:string; url?:string; tab?:{id?:number}; }
    const onMessage:{addListener(callback:(message:unknown,sender:Sender,respond:(reply:unknown)=>void)=>boolean|void):void};
    function sendMessage(message:unknown):Promise<unknown>;
  }
  namespace storage {
    const local:{get(keys:string[]):Promise<Record<string,unknown>>;set(values:Record<string,unknown>):Promise<void>};
    const onChanged:{addListener(callback:(changes:Record<string,unknown>,area:string)=>void):void;removeListener(callback:(changes:Record<string,unknown>,area:string)=>void):void};
  }
  namespace tabs { function query(query:{active:boolean;currentWindow:boolean}):Promise<{url?:string}[]>; }
}
