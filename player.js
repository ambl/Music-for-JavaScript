function player(){
    const log=(...e)=>{console.log(...e);};
    const local = location.href.indexOf("127.0.0.1")!=-1?true:false;
    const containerEl = (typeof container=="undefined")?document.currentScript.parentElement:container;
    const [audioContainer,downloadButton,audioEl,sourceEl,canvasEl,regenerateButton,analyserSwitch,repeatToggleEl,controlEl,lengthEl,sampleRateEl,channelsEl,bitEl]=(()=>{
        let l = ".audio-container;.download-a;audio;source;canvas;.regenerate;.analyser;.repeat-checkbox;.control-container;.length-input;.sample-rate-input;.num-channels-input;.bit-input".split(";");
        l.forEach((e,i,a)=>{a[i]=containerEl.querySelector(e);});
        return l;
    })();
    const width = canvasEl.offsetWidth, height = canvasEl.offsetHeight;
    const ctx = canvasEl.getContext("2d");
    let audioDuration = 0, audioDurationTxt;

    function centerText(list, fillColor = "white", strokeColor=null, fontSize=20, c=ctx){
        const h = list.length * fontSize, y = height/2-h/2;
        c.font = fontSize + "px MonoSpace";
        c.textAlign= "center";
        c.textBaseline = "top";
        for(let i =0; i< list.length; i++){
            c.lineWidth = fontSize/4;
            if(strokeColor){c.strokeStyle = strokeColor; c.strokeText(list[i],width/2, y+(i*fontSize), width);}
            c.fillStyle= fillColor;
            c.fillText(list[i],width/2, y+(i*fontSize), width);
        }
    }

    function background(col, c=ctx){
        c.fillStyle = col;
        c.fillRect(0,0,width, height);
    }

    function line(x1,y1,x2,y2,col="white",context){
        let c = context||ctx;
        c.beginPath();
        c.moveTo(x1,y1);
        c.lineTo(x2,y2);
        c.strokeStyle=col;
        c.stroke();
    }

    function circle(x=0, y=0, radius=50, fillCol="white", strokeCol, context){
        let c = context||ctx;
        c.beginPath();
        c.arc(x,y,radius,0,2*Math.PI);
        
        if(fillCol){
            c.fillStyle= fillCol;
            c.fill();
        }
        if(strokeCol){
            c.strokeStyle = strokeCol;
            c.stroke();
        }
        c.closePath();
    }
    function text(str="", x=0, y=0, fillColor="white",fontSize=10,align="left",base="top", maxWidth){
        let list;
        if(isFinite(str))list = [str];
        else list = str.split("\n");
        
        if(!maxWidth)maxWidth = width;
    
        ctx.font = fontSize + "px MonoSpace";
        ctx.textAlign= align;
        ctx.textBaseline = base;
    
        for(let i =0; i< list.length; i++){
            ctx.fillStyle= fillColor;
            ctx.fillText(list[i],x, y + (i*fontSize), maxWidth);
            // ctx.strokeText(list[i],x, y + (i*fontSize), maxWidth);
        }
    }

    function WAA(){
        class Waa{
            constructor(){
                let audioCtx = this.audioCtx = new AudioContext();
                let gain = this.input = this.gain = audioCtx.createGain();
                this.sampleRate = audioCtx.sampleRate;
                gain.connect(audioCtx.destination);
            }
            createAnalyser(mode,ctx){return new Analyser(this,mode,ctx);}
        }
        
        class Analyser{
            constructor(waa, mode = "time", canvasCtx=null){
                this.canvasCtx = canvasCtx;
                
                let analyser = this.analyser = waa.audioCtx.createAnalyser();
                analyser.fftSize = mode=="freq"?256*8:256*32;
                this.draw = mode=="freq"?this.drawFreq:this.drawTime;
                
                let bufferLength = this.bufferLength = analyser.frequencyBinCount;
                this.dataArray = new Uint8Array(bufferLength);
                waa.input.connect(analyser);
                
                if(mode=="time")return;
                this.freqLineList =[];
                this.freqDataIndexList =[];
                let sampleRateHalf = waa.audioCtx.sampleRate/2;
                let cw = canvasCtx.canvas.width;
                let offsetRatio = Math.log2(12.5)/Math.log2(sampleRateHalf);
                let offset =  cw * offsetRatio;
                for(let i=0, t, hz=0; hz<sampleRateHalf;i++){
                    hz = 25*2**i;
                    t = cw * Math.log2(hz)/Math.log2(sampleRateHalf) -offset;
                    t /= 1-offsetRatio;
                    this.freqLineList.push(Math.round(Math.max(t,0)));
                }
                for(let i = 0, t, l=this.bufferLength; i < l; i++) {
                    t = cw* Math.log2(sampleRateHalf/l*i)/Math.log2(sampleRateHalf) -offset;
                    t /= 1-offsetRatio;
                    this.freqDataIndexList.push( Math.max(t,0) ); // 44100hz/2048fft size -> 21.5hz 毎のデータ
                }
            }
            
            drawFreq(){
                let canvasCtx = this.canvasCtx, canvas = canvasCtx.canvas, cw=canvas.width, ch=canvas.height;
                let arr = this.dataArray;
                this.analyser.getByteFrequencyData(arr);

                background("#044");
                for(let i=0, x, len=this.freqLineList.length; i<len; i++){
                    x = this.freqLineList[i];
                    switch(i){
                        case 2: case 6: case 9: line(x,0,x,ch,"#088");break;
                        default :line(x,0,x,ch,"#055");
                    }
                }
                
                canvasCtx.beginPath();
                for(let i = 0,x,y,h = ch/0x100, l=this.bufferLength; i < l; i++) {
                    y = ch - h*arr[i];
                    x = this.freqDataIndexList[i];
                    canvasCtx.lineTo(x, y);
                }
                
                canvasCtx.strokeStyle = '#fff';
                canvasCtx.lineWidth = 1;
                canvasCtx.stroke();
                canvasCtx.closePath();
            }
            
            drawTime(){
                let canvasCtx = this.canvasCtx, cw = canvasCtx.canvas.width, ch = canvasCtx.canvas.height;
                this.analyser.getByteTimeDomainData(this.dataArray);
                background("#044");
                line(0,ch/2,cw,ch/2,"#088");
                line(0,ch/4,cw,ch/4,"#055");
                line(0,ch*3/4,cw,ch*3/4,"#055");
                let sliceWidth = cw / this.bufferLength;
                let x = 0, y = ch / 2;
                canvasCtx.strokeStyle = '#fff';
                canvasCtx.beginPath();
                canvasCtx.moveTo(x, y);
                for (let i = 0, len = this.bufferLength, ar=this.dataArray ; i < len; i++) {
                    y = ch - ar[i]/0x100*ch;
                    canvasCtx.lineTo(x, y);
                    x += sliceWidth;
                }
                canvasCtx.lineTo(cw, ch/ 2);
                canvasCtx.stroke();
                canvasCtx.closePath();
            }
        }

        return new Waa();
    }

    window.onerror = function(msg, url, line, col, error) { 
        background("black");
        centerText([msg]);
    };

    //------------------------------------------------------------
    let waa, analyser, analyser2, analyserMode = "freq", startTime = 0;
    function startup(){
        canvasEl.removeEventListener("click", startup);
        repeatToggleEl.addEventListener("change",e=>audioEl.loop = e.target.checked);
        regenerateButton.addEventListener("click", regenerate); 
        analyserSwitch.addEventListener("click", changeAnalyserMode); 
        
        waa = WAA();
        analyser  = waa.createAnalyser("time",ctx);
        analyser2 = waa.createAnalyser("freq",ctx);
        let source = waa.audioCtx.createMediaElementSource(audioEl);
        source.connect(waa.input);
        audioEl.onplaying  = canvasLoop;

        startWorker();
    }

    function startWorker(setting){
        startTime = Date.now();
        let workerJs = singleFileMode?createWorker(worker):new Worker(scoreScriptUrl);
        workerJs.onmessage = workerCallback;
        workerJs.postMessage({setting});
        workerJs.addEventListener("error", e=>workerMessage(e.message), false);
    }

    function createWorker(fnc){
        let workerCode = fnc.toString();
        workerCode = workerCode.match(/^function worker\(\)\{([\s\S]+)\}$/m)[1];
        let txtStudio = studioContainer.toString();
        txtStudio = txtStudio.match(/^function studioContainer\(\)\{([\s\S]+)\}$/m)[1];
        workerCode = workerCode.replace(/importScripts\(\"studio\.js\"\)\;/, txtStudio );
        let blob = new Blob([ workerCode ], { type: "text/javascript" });
        let url = URL.createObjectURL(blob);
        return new Worker(url);
    }

    function workerMessage(msg){
        background("black");
        centerText([msg]);
    }

    function workerCallback(e){
        if(typeof e.data === "string"){workerMessage(e.data);return;}
        if(e.data.wav){
            setAudioFile(e.data.wav, containerEl);
        }
        if(e.data.setting){
            log( (Date.now() -startTime).toFixed(3)+"ms",e.data.setting);
            let s = e.data.setting;
            channelsEl.value = s.numChannels;
            sampleRateEl.value = s.sampleRate;
            bitEl.value = s.bitsPerSample;
            lengthEl.value = s.length;
        }
    }
    function setAudioFile(array){
        let blob = new Blob([array], {type: "audio/wav"});
        let urlObj = URL.createObjectURL(blob);
        
        sourceEl.src = urlObj;
        downloadButton.href = urlObj;
        downloadButton.download = new Date().toString().split(" GMT")[0] + ".wav";
        
        audioEl.load();
        audioContainer.style.visibility = "visible";

        function start(){
            audioEl.volume = 0.8;
            audioDuration = audioEl.duration;
            audioDurationTxt = numToTime(audioDuration);
            audioEl.play();
            canvasEl.addEventListener("click",canvasElClickHandler);
            audioEl.removeEventListener("canplay",start);
        }
        audioEl.addEventListener("canplay",start);
    }

    function canvasElClickHandler(e){
        let rect = e.target.getBoundingClientRect();
        let [mouseX, mouseY] = [
            Math.floor(  e.x - rect.left  ),
            Math.floor(  e.y - rect.top   )
        ];

        if(controls.seek(mouseX,mouseY))return;
        if(controls.changeVolume(mouseX,mouseY))return;
        playToggle();

    }

    function numToTime(n){
        let m = Math.floor(n/60);
        let s = Math.floor(n%60).toString();
        if(s.length==1)s = "0"+s;
        return m +":" + s;
    }

    let controls = {
        m:10,
        seek(mouseX,mouseY){
            if(mouseY>height-20){
                let barWidth = width - this.m*2;
                audioEl.currentTime = (mouseX-this.m)/barWidth*audioDuration; // seek
                if(audioEl.paused)canvasLoop()
                return true;
            }
        },
        changeVolume(mouseX,mouseY){
            let barWidth = 50;
            let x = width -barWidth -this.m;
            if(mouseY < 20 && mouseX > x -this.m){
                let volume = (mouseX-x)/barWidth; // volume
                audioEl.volume = Math.min(1,Math.max(0,volume));
                if(audioEl.paused)canvasLoop()
                return true;
            }
        },
        drawSeekBar(){
            let m = this.m;
            let y = height-m;
            let barWidth = width - m*2;
            let cTime = audioEl.currentTime;
            line(m,y,width-m,y,"white");;
            let circleX = m + cTime/audioDuration*barWidth;
            circle(circleX,y,height/30);

            let cTimeTxt = numToTime(cTime) + " / " + audioDurationTxt;
            text(cTimeTxt,width-m,y-m,"white",10,"right","bottom")
        },
        drawVolumeBar(){
            let y = this.m;
            let barWidth = 50;
            let x = width -barWidth -this.m;
            line(x,y,x+barWidth,y,"white");
            let circleX = x + audioEl.volume * barWidth;
            circle(circleX,y,height/30);
        },
        draw(){
            this.drawSeekBar();
            this.drawVolumeBar();
        }
    }

    function playToggle(){
        if(audioEl.paused){
            audioEl.play();
            canvasLoop();
        }
        else audioEl.pause();
    }

    function canvasLoop(){
        ctx.lineWidth = 1;
        switch(analyserMode){
            case "time": analyser.draw();break;
            case "freq":analyser2.draw();break;
            case "none":background("black");break;
        }
        controls.draw();
        if(audioEl.paused)return;
        // if(analyserMode=="none")return;
        requestAnimationFrame(canvasLoop);
    }


    function regenerate(){
        audioEl.pause();
        canvasEl.removeEventListener("click",canvasElClickHandler);
        containerEl.querySelector(".audio-container").style.visibility = "hidden";
        let b=(v,mi,ma)=>{return Math.max(mi,Math.min(ma,v));};
        let setting={
            numChannels:channelsEl.value==2?2:1,
            sampleRate:Math.max(3000,sampleRateEl.value),
            bitsPerSample:b(Math.floor(bitEl.value/8)*8, 8, 32),
            length:Math.max(1,lengthEl.value),
        };
        startWorker(setting);
    }

    function changeAnalyserMode(e){
        switch(analyserMode){
            case "freq": analyserMode = "time"; break;
            case "time": analyserMode = "none"; break;
            case "none": analyserMode = "freq"; break;
        }
        canvasLoop();
        e.stopPropagation();
        e.preventDefault();
    }
    //------------------------------------------------------------

    background("#044");
    centerText(["tap to play"],"#fff");
    canvasEl.addEventListener("click", startup);
    if(local)startup();
}