function finish(setting, trackL, trackR){
    function convertInto8Array(x,maxVol){
        let y;
        switch(setting.bitsPerSample){
            case 8:
                y = new Uint8Array(x.length);
                for( let i=0, len=x.length; i<len; i++)y[i]= ( Math.round( (x[i]/maxVol +1) /2 *0xff ) );
                return y;// 128が無音なのでround
            case 16:
                y = new Int16Array(x.length);//符号付き
                for( let i=0, len=x.length; i<len; i++)y[i]=( x[i]/maxVol *0x7fff );
                return new Uint8Array(y.buffer);// [0,-1,　1] -> [0, -32767, 32767] // 最大値から1少ない
            case 32:
                y = new Float32Array(x.length);
                for( let i=0, len=x.length; i<len; i++)y[i]=( x[i]/maxVol);
                return new Uint8Array(y.buffer);
            case 24:
                y = new Uint8Array(x.length*3);
                for( let i=0,t, len=x.length; i<len; i++){
                    t = Math.trunc( x[i]/maxVol *0x7fffff );
                    y[i*3]= t%0x100;
                    t = t>>>8;
                    y[i*3+1] = t%0x100;
                    t = t>>>8;
                    y[i*3+2] = t;
                }
                return y;
        }
    }

    function fuseStereo(l,r){
        let y = new Uint8Array(l.length*2);
        let c = setting.bitsPerSample/8;
        for(let i=0, len=l.length; i<len; i+=c){
        for(let j=0; j<c; j++){
            y[i*2  +j] = l[i+j];
            y[i*2+c+j] = r[i+j];
        }
        }
        return y;
    }
    //http://soundfile.sapp.org/doc/WaveFormat/
    function createWavFormatArray(Data){
        const   NumChannels   = setting.numChannels,
            SampleRate    = setting.sampleRate,
            BitsPerSample = setting.bitsPerSample,
            ByteRate      = SampleRate * NumChannels * BitsPerSample /8,
            BlockAlign    = NumChannels * BitsPerSample/8,
            SubChunk2Size = Data.length,
            ChunkSize     = 36 + SubChunk2Size,
            AudioFormat   = BitsPerSample==32?3:1;
            preByteArray = [
                0x52494646,ChunkSize,0x57415645,0x666d7420,0x00000010,AudioFormat,
                NumChannels,SampleRate,ByteRate,BlockAlign,BitsPerSample,0x64617461,SubChunk2Size
            ],
            fieldSizeList =[4,4,4,4,4,2,2,4,4,2,2,4,4],
            endianList    =[0,1,0,0,1,1,1,1,1,1,1,0,1];
        let header, fields = [];
        
        function divideIntoByteArray(len, d, reversal){
            let arr = [];
            for( let i = 0, s= (len-1)*8; i < len ; i++){
                arr[i] = d>>>s;
                d -= arr[i]*2**s;
                s -= 8;
            }
            if(reversal)arr = arr.reverse();
            return arr;
        }
        
        for(let i = 0; i < preByteArray.length; i++){
            fields.push(divideIntoByteArray(fieldSizeList[i],preByteArray[i],endianList[i]));
        }
        header = [].concat(...fields);
        
        let byteArray = new Uint8Array(header.length + Data.length);
        for( let i = 0, len = header.length; i < len; i++)byteArray[i] = header[i];
        for( let i = 0, len = byteArray.length, h = header.length; i < len; i++)byteArray[i+h] = Data[i];
        
        return byteArray;
    }

    function getMaxVol(...arg){
        let max = [0,0]; // [L,R]
        for(let j=0; j<arg.length; j++){
            if(!arg[j])break;
            for( let i=0, len=arg[j].length; i<len; i++){
                if( Math.abs(arg[j][i])>max[j] )max[j]=Math.abs(arg[j][i]);
            }
        }
        let maxVol=Math.max(...max), maxText=[].concat(max);
        function decibel(amp){return 20*Math.log10(amp);}
        maxText.forEach((e,i,a)=>{a[i]=(e*100).toFixed(1)+"%("+decibel(e).toFixed(1)+"dB)";});
        console.log("master input: "+ maxText.join(", "));
        return maxVol;
    }

    let data, maxVol = getMaxVol(trackL,trackR);
    if( trackR ){
        let l = convertInto8Array(trackL,maxVol);
        let r = !trackR?l:convertInto8Array(trackR,maxVol);
        data = fuseStereo(l,r);
    }
    else data = convertInto8Array(trackL,maxVol);
    
    let wavBinary = createWavFormatArray(data);
    return wavBinary;
}

class Mixer{
    constructor(numTrack=16, setting){
        this.trackList = [];
        this.setting = setting;
        this.masterTrack = new Track(-1,this);
        for(let i = 0; i < numTrack; i++)this.trackList.push( new Track(setting,i,this) );
    }
    
    mixDown(){
        let masterTrack = this.masterTrack, trackList = this.trackList;
        let maxTrackLength = 0;
        for(let i = 0; i < trackList.length; i++){
            if(!trackList[i].isEnabled)continue;
            maxTrackLength = Math.max(trackList[i].lastIndex, maxTrackLength);
        }
        masterTrack.l = new Float64Array(maxTrackLength);
        masterTrack.r = new Float64Array(maxTrackLength);
        trackList.forEach(e=>addTracks(e,masterTrack));
        
        if(this.setting.numChannels==1){
            for(let i=0; i < maxTrackLength; i++ )masterTrack.l[i] = masterTrack.l[i] + masterTrack.r[i];
        }
    }
    
    solo(...numList){
        for(let i = 0; i < this.trackList.length; i++)this.trackList[i].isEnabled=false;
        for(let i = 0; i < numList.length; i++)this.trackList[numList[i]].isEnabled=true;
    }
    mute(...numList){
        for(let i = 0; i < numList.length; i++)this.trackList[numList[i]].isEnabled=false;
    }
}
        
function addTracks(track,parent){
    if(!track.isEnabled)return;
    track.applyParam();
    
    let error = [], errorLog=e=>{error.push(e);};
    track.elements.forEach((e,j)=>{
        let startI = e.time, lVol = e.lVol, rVol = e.rVol;
        let waveL = e.wave[0], waveR = e.wave[1];
        if(e.isStereo){
            for(let i = 0, end=waveL.length;i<end;i++){
                // if(!isFinite(e.wave[0][i])||!isFinite(e.wave[1][i])){errorLog([j,i]);continue;}
                parent.l[i+startI] += waveL[i]*lVol;
                parent.r[i+startI] += waveR[i]*rVol;
            } 
        }
        else if(parent.r){
            for(let i = 0, end=waveL.length;i<end;i++){
                // if(!isFinite(waveL[i])){errorLog([j,i]);continue;}
                parent.l[i+startI] += waveL[i]*lVol;
                parent.r[i+startI] += waveL[i]*rVol;
            }
        }
        else{
            for(let i = 0, end=waveL.length;i<end;i++){
                // if(!isFinite(waveL[i])){errorLog([j,i]);continue;}
                parent.l[i+startI] += waveL[i]*lVol;
            }   // バウンス用
        }
    });
    if(error.length>0)console.log({track:track.number, error});
    return parent;
}

class Track{
    constructor(setting,num,mixer){
        this.isEnabled = true;
        this.isStereo = false;
        this.pan = 0;
        this.amp = 1;
        this.elements = [];
        this.lastIndex = 0;
    }
    set volume(v){this.amp=v**0.5;}
    put(array, sec=0, pan=0, velocity=1){
        if( sec>60*60*1 )throw new Error("an element put too late");
        if(pan>1||pan<-1||isNaN(pan))throw new Error("pan should be -1 to 1");
        let pan2 = Math.sin(Math.PI/2*pan);
        let time = Math.round(sampleRate*sec);
        let lVol = (1-(pan2+1)/2)**0.5 *velocity;
        let rVol = (  (pan2+1)/2)**0.5 *velocity;
        if(pan!==0)this.isStereo = true;
        let isStereo = Array.isArray(array[0])?true:false;
        array = isStereo?array:[array,[]];
        let len = array[0].length;  // ステレオ音源は同じ長さの配列しか受け付けない
        this.lastIndex  = Math.max( this.lastIndex , len +time);
        this.elements.push({wave:array, time, lVol, rVol, isStereo});    
    }
    
    applyParam(){//(pan & amp) to elements
        let pan = Math.sin(Math.PI/2*this.pan), rv=(pan+1)/2, lv=1-rv;
        lv = lv**0.5 *this.amp;
        rv = rv**0.5 *this.amp;
        for(let i=0, len=this.elements.length; i<len;i++){
            this.elements[i].lVol*=lv;
            this.elements[i].rVol*=rv;
        }
    }
    bounce(){
        this.applyParam();
        let parent = {l: new Array(this.lastIndex).fill(0),};
        if(this.isStereo||this.pan!==0)parent.r = new Array(this.lastIndex).fill(0);
        addTracks(this,parent);
        if(!this.isStereo&&this.pan===0) return parent.l;
        else return [parent.l, parent.r]; 
    }
}

//------------------------------------------------------------------------------------------

let sampleRate, numChannels, mixer, wavBinary, midi;
async function flow(){
    perf();
    if(midi){;
        midi = await getMidiData(midi);
        perf("ms for midi");
    }
    postMessage("recording...");
    compose();
    
    perf("ms for recording")
    postMessage("mixing...");
    mixer.mixDown();
    
    perf("ms for mixing")
    postMessage("waving...");
    if(numChannels == 2)wavBinary = finish(setting, mixer.masterTrack.l, mixer.masterTrack.r);
    else wavBinary = finish(setting, mixer.masterTrack.l);
    
    perf("ms for waving")
    postMessage("completed");
    postMessage({setting,wav:wavBinary});
}

function start(message){
    if(message.data.setting){
        let s = message.data.setting;
        if(s.numChannels)setting.numChannels = s.numChannels;
        if(s.sampleRate)setting.sampleRate = s.sampleRate;
        if(s.bitsPerSample)setting.bitsPerSample = s.bitsPerSample;
        if(s.length)setting.length = s.length;
    }
    sampleRate = setting.sampleRate
    numChannels = setting.numChannels;
    midi=setting.midi;
    flow();
}
self.addEventListener("message",start);

//------------------------------------------------------------------------------------------


const performanceCheck = {
    list:[],
    exec(text=""){
        const p =performance.now(), li = this.list, le = li.length;
        if(le>0)console.log(`[${le}]total:${p-li[0]}, last:${p-li[le-1]} ${text}`);
        li.push(p);
    },
};
const log =(...e)=>console.log(...e), perf =memo=>performanceCheck.exec(memo);

function randInt(min,max){
    if(max===undefined){max=min;min=0;}
    return min + Math.round( Math.random()*(max-min));
}
function rand(min,max){
    if(max===undefined){max=min;min=0;}
    return min + Math.random()*(max-min);
}
function randChoice(l){return l[Math.floor(Math.random()*l.length)];}
function coin(arg=0.5){return (Math.random()<arg)?true:false;}
const PI=Math.PI, PI2 = Math.PI*2, sin=Math.sin, floor=Math.floor, random=Math.random;
