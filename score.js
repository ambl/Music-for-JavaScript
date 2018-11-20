importScripts("studio.js");

const setting = {
    numChannels: 2,
    sampleRate: 12000, // 3000~
    bitsPerSample: 16,
    length: 1,
    midi:null,
};

function copy(x,seconds=0){return new Array( Math.round( seconds *sampleRate) ).concat(x);}

function line(...list){
    let dataList = [], output = [];
    if(Array.isArray(list[0]))list=list[0];
    if(list[0]!==0)list = [0,list[1]].concat(list); //line(seconds, value, ...)
    for(let i = 0; i < list.length; i+=2){
        dataList.push({
            time  : Math.floor( list[i  ] *sampleRate ),
            value : list[i+1],
        });
    }
    for(let i=0; i<dataList.length-1; i++){
        dataList[i].slope = (dataList[i].value-dataList[i+1].value)/(dataList[i].time-dataList[i+1].time);
        dataList[i].length = dataList[i+1].time - dataList[i].time; 
    }
    
    for(let i=0; i<dataList.length-1; i++){
        for(let j = 0, len = dataList[i].length ; j < len; j++){
            output.push( dataList[i].slope*j + dataList[i].value );
        }
    }
    return output;
}

// -----------------------------------------------------------------------------

function fade(x,sec=0.01, sec2=sec){
    for(let i = 0, c=Math.round(sec *sampleRate); i<c; i++)x[i]*=i/c;
    for(let i = 0, c=Math.round(sec2*sampleRate),la=x.length-1; i<c; i++)x[la-i]*=i/c;
    return x;
}
function linearAmp(x, ...list){
    let len = x.length;
    if(list.length==0)list = [0.01,1,0.1,0.4];// linearAmp( wave, sec, vol, sec, vol ...);
    for(let i=0, s; i<list.length; i+=2){
        s = Math.round(list[i]*sampleRate);
        if(s>=len)throw Error(`linearAmp☆　input: ${s}, wave length: ${len}(${len/sampleRate}s)`);
        list[i] = s;
    }
    list = [0,0].concat(list, x.length, 0); // 最初と最後はvol 0, 指定しようとするとエラー
    for(let i=0, pInd=0 ,slope, x1, x2, y1, y2; i<len; i++){
        if(i==list[pInd]){
            [x1,y1,x2,y2] = [ list[pInd], list[pInd+1], list[pInd+2], list[pInd+3] ];
            slope = (y2-y1)/(x2-x1);
            pInd+=2;
        }
        x[i] *= slope * (i-x1) +y1;
    }
    return x;
}

function lowFilter(x, fc = 550){
    let y =[0], b1 = Math.exp(-2*Math.PI*fc/sampleRate), a0 = 1-b1;
    for(let n=1, len = x.length; n < len; n++)y[n] = (a0*x[n]) + (b1*y[n-1]);
    return y;
}
function highFilter(x, fc= 550){
        let len = x.length, y =[0], b1 = Math.pow(Math.E,-2*Math.PI*fc/sampleRate), a0=(1+b1)/2, a1=-a0;
        for(let n = 1; n < len; n++)y[n] = (a0*x[n]) + (a1*x[n-1]) + (b1*y[n-1]);
        return y;
}

class SoundRepository{
    constructor(arg){
        this.storage ={};//id
        this.func = arg;
    }
    get(id){
        if(this.storage.hasOwnProperty(id))return this.storage[id];
        let sound = this.func(...arguments);
        this.storage[id] = sound;
        return sound;
    }
} 

function trkReverb(trk,wave,startTime=0,spread=0.8,time=0.03,feedback=0.7,num=16){
    for(let i=1,vel=feedback,t=0,pan;i<=num;i++){
        t+=Math.random()*time;
        pan = Math.random() ** (1-spread);
        pan *= ((i%2)*2)-1;
        trk.put(wave,startTime+t,pan,vel);
        vel*=feedback;
    }
}

function bitSine(hz=440,sec=1,step=8){
    let y=[],c=Math.PI*2/sampleRate*hz;
    for(let i=0,l=sec*sampleRate;i<l;i++){
        y[i] = Math.round( Math.sin(c*i) *step)/step;
    }
    return y;
}

function compose(){
    mixer = new Mixer(16,setting);
    const trk = mixer.trackList, solo =(...n)=>mixer.solo(...n), mute =(...n)=>mixer.mute(...n);
    const [trk0,trk1,trk2,trk3,trk4,trk5,trk6,trk7,trk8,trk9,trk10,trk11,trk12,trk13,trk14,trk15,trk16] = trk;

    const bpm = 75;
    const bps = bpm/60, spb = 60/bpm; // hz=bps
    const [n16,n8,n4,n2,bar] = [spb/4,spb/2,spb,spb*2,spb*4];
    const endTime = 60*setting.length;
    
    let notes = [], baseHz  = 50;
    
    //harmonic tones
    // for(let i=0;i<=12;i++)notes[i] = baseHz*(i+1);

    notes=[9,11,12,15,16];
    for(let i=0,oct=0;i<15;i++){
        oct = Math.floor(i/5);
        notes[i] = notes[i%5]*(2**oct);
    }
    notes = notes.map(e=>e*baseHz/8);
    

    function fmS(hz,sec){
        let mod1Hz = hz *9/8, mod1 = bitSine(mod1Hz,sec,8);
        let mod2Hz = hz*15/8, mod2 = bitSine(mod2Hz,sec,8);
        let modLevel = hz*0.0002;
        let modAmp = line(0,modLevel*7,  0.005,modLevel,  sec+0.2,0)
        let phase = [], output = [];
        for(let i=0,l=sec*sampleRate;i<l;i++){
            phase[i]  = modAmp[i] * (mod1[i]+1)*2;
            phase[i] += modAmp[i] * (mod2[i]+1)*0.8;
            output[i] = Math.sin(PI2*hz*i/sampleRate + phase[i]);
        }
        linearAmp(output);
        output = highFilter(output,hz);
        return output;
    }

    let patternList =[
        [0,1,2,1],
        [0,-1,-2,-1],
        [0,1,0,1],
        [0,-1,0,-1],
        [0,2,1,2],
        [0,-2,-1,-2],
        [0,1,-1,1],
        [0,-1,1,-1],
        [2,1,0,1],
        [-2,-1,0,-1],
    ]


    function sub(n,t){
        let pt = copy(randChoice(patternList));
        pt = pt.map(e=>e+n);
        for(let i=0;i<pt.length;i++){
            let n = pt[i];
            let hz = notes[n]*2 +0.5;
            let time = t+n8*i +0.01;
            if(i%2==0)sub2(n,time);
            let s = srList[1].get(hz,n8*1.5);
            trk1.put(s,time)
            reverbTrack.put(s,time);
        }
    }

    function sub2(n,t){
        let pt = copy(randChoice(patternList));
        pt = pt.map(e=>e+n);
        for(let i=0;i<pt.length;i++){
            let n = pt[i];
            if(n>=12)n-=5;
            let time = t+n16*i + 0.00;
            let hz = notes[n]*4 -0.5;
            let s = srList[2].get(hz,n4);
            trk2.put(s,time)
            reverbTrack.put(s,time);
        }

    }

    let reverbTrack = new Track();
    let srList = [1,1,1].map(e=>new SoundRepository((id,sec)=>{
        return fmS(id,sec);
    }));

    // sequencer
    for(let i=0,t=0,n=8,preN=-1;t<endTime;i++){
        n +=randChoice([-1,0,1]);
        n = Math.max(5,Math.min(notes.length-5,n));
        if(i%2==0)sub(n,t,n4);
        if(preN!=n||i%4==0){
            let hz = notes[n];
            let s = srList[0].get(hz,n2);
            reverbTrack.put(s,t);
            trk0.put(s,t)
        }
        preN = n;
        t+=n4;
    }

    let rev = reverbTrack.bounce();
    rev = lowFilter(rev, 1600);
    trkReverb(trk15,rev,0,0.9,0.08,0.8,24);

    trk1.pan =  0.75;
    trk2.pan = -0.75;
    trk1.amp = 0.67;
    trk2.amp = 0.67;
    trk15.amp = 0.3;
    
};

