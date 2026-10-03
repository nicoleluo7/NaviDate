// Accumulate mono PCM16 at the AudioContext's 24kHz rate. No recordings are saved.
class NaviPCM extends AudioWorkletProcessor {
  constructor(){ super(); this.buffer=new Int16Array(2400); this.offset=0; }
  process(inputs){
    const samples=inputs[0]?.[0];
    if(samples)for(const sample of samples){
      this.buffer[this.offset++]=Math.round(Math.max(-1,Math.min(1,sample))*(sample<0?32768:32767));
      if(this.offset===this.buffer.length){this.port.postMessage(this.buffer.buffer,[this.buffer.buffer]);this.buffer=new Int16Array(2400);this.offset=0;}
    }
    return true;
  }
}
registerProcessor("navi-pcm",NaviPCM);
