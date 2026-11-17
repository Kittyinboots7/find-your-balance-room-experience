'use strict';
// Real field recordings; all source recordings are public-domain / CC0.
// See AUDIO_CREDITS.md for authors, sources, and mastering notes.
class RitualAudio {
 constructor(){
  this.ctx=null;this.master=null;this.source=null;this.muted=false;
  this.theme='flow';this.level=.62;this.generation=0;this.recordings=new Map();
 }
 async start(theme){
  this.stop();this.theme=theme;
  const settings={
   flow:{file:'flow-rain.mp3',cutoff:6500,treble:-3.5,bass:1,crossfade:4},
   grow:{file:'grow-forest.mp3',cutoff:8500,treble:-2,bass:0,crossfade:2.5},
   shine:{file:'shine-fireplace.mp3',cutoff:4800,treble:-6,bass:2,crossfade:4}
  }[theme];
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context||!settings)return false;
  const generation=this.generation,ctx=new Context();this.ctx=ctx;
  const master=ctx.createGain();master.gain.value=0;this.master=master;
  // Gentle filtering keeps the texture warm, with no synthetic noise layer.
  const highpass=ctx.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=45;highpass.Q.value=.5;
  const lowpass=ctx.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=settings.cutoff;lowpass.Q.value=.5;
  const treble=ctx.createBiquadFilter();treble.type='highshelf';treble.frequency.value=2600;treble.gain.value=settings.treble;
  const bass=ctx.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=220;bass.gain.value=settings.bass;
  const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-22;compressor.knee.value=18;compressor.ratio.value=2.3;compressor.attack.value=.025;compressor.release.value=.4;
  highpass.connect(lowpass).connect(treble).connect(bass).connect(compressor).connect(master).connect(ctx.destination);
  document.documentElement.dataset.ambienceState='loading';
  try{
   // Resume within the entry-button gesture, before the recording is fetched.
   await ctx.resume();
   if(!this.recordings.has(theme)){
    const request=fetch(new URL('assets/audio/'+settings.file,document.baseURI)).then(response=>{
     if(!response.ok)throw new Error('Ambient recording could not be loaded');
     return response.arrayBuffer();
    }).catch(error=>{this.recordings.delete(theme);throw error;});
    this.recordings.set(theme,request);
   }
   const bytes=await this.recordings.get(theme);
   if(generation!==this.generation)return false;
   const recording=await ctx.decodeAudioData(bytes.slice(0));
   if(generation!==this.generation)return false;
   const source=ctx.createBufferSource();source.buffer=RitualAudio.makeLoop(ctx,recording,settings.crossfade);source.loop=true;source.connect(highpass);source.start();this.source=source;
   this.setVolume(this.muted?0:this.level,3);
   document.documentElement.dataset.ambienceState='playing';
   document.documentElement.dataset.ambienceTheme=theme;
   return true;
  }catch(error){
   if(generation!==this.generation)return false;
   this.stop();document.documentElement.dataset.ambienceState='unavailable';
   console.warn('Ambient recording unavailable:',error.message);
   return false;
  }
 }
 static makeLoop(ctx,recording,seconds){
  const overlap=Math.max(1,Math.min(Math.floor(seconds*recording.sampleRate),Math.floor(recording.length/4)));
  const length=recording.length-overlap,body=recording.length-2*overlap;
  const buffer=ctx.createBuffer(recording.numberOfChannels,length,recording.sampleRate);
  let energy=0,peak=0;
  for(let channel=0;channel<recording.numberOfChannels;channel++){
   const input=recording.getChannelData(channel),output=buffer.getChannelData(channel);
   output.set(input.subarray(overlap,recording.length-overlap));
   // Equal-power overlap joins the tail back into the opening ambience.
   for(let i=0;i<overlap;i++){
    const angle=(i/(overlap-1||1))*Math.PI/2;
    output[body+i]=input[recording.length-overlap+i]*Math.cos(angle)+input[i]*Math.sin(angle);
   }
   let mean=0;for(let i=0;i<length;i++)mean+=output[i];mean/=length;
   for(let i=0;i<length;i++){output[i]-=mean;energy+=output[i]*output[i];peak=Math.max(peak,Math.abs(output[i]));}
  }
  const rms=Math.sqrt(energy/(length*recording.numberOfChannels));
  const gain=Math.min(.16/Math.max(rms,.0001),.72/Math.max(peak,.0001),3);
  for(let channel=0;channel<buffer.numberOfChannels;channel++){
   const output=buffer.getChannelData(channel);for(let i=0;i<length;i++)output[i]*=gain;
  }
  return buffer;
 }
 setVolume(volume,seconds=.6){
  if(!this.ctx||!this.master)return;
  const time=this.ctx.currentTime,gain=this.master.gain;
  if(typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(time);
  else{const current=gain.value;gain.cancelScheduledValues(time);gain.setValueAtTime(current,time);}
  gain.linearRampToValueAtTime(Math.max(0,Math.min(1,volume)),time+seconds);
 }
 mute(){this.muted=!this.muted;this.setVolume(this.muted?0:this.level);return this.muted;}
 fade(){this.setVolume(0,3);}
 stop(){
  this.generation++;
  if(this.source){try{this.source.stop();}catch{}this.source=null;}
  if(this.ctx){this.ctx.close().catch(()=>{});this.ctx=null;}
  this.master=null;document.documentElement.dataset.ambienceState='stopped';
 }
}
window.RitualAudio=RitualAudio;
