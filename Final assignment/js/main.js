// 全局场景数据
let canvas, gl, program;
const scene = {
    spheres: [],
    walls: [],
    // 支持多个点光源
    lights: [ { position: [5,8,2], color: [1,1,1] } ],
    camera: { position: [0, 12, 6], target: [0,0,0], fov: 45 * Math.PI/180 },
    keys: { w:false,a:false,s:false,d:false }
};

function compileShader(gl, type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
        console.error(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null;
    }
    return s;
}

// 加载纹理（异步）
function loadTexture(gl, url){
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // 临时像素
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1,1,0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128,128,128,255]));
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = ()=>{
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        if(isPowerOfTwo(img.width) && isPowerOfTwo(img.height)){
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } else {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
    };
    img.src = url;
    return tex;
}

function isPowerOfTwo(v){ return (v & (v-1)) === 0 && v !== 0; }

function createProgram(gl, vsSrc, fsSrc){
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if(!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)){ console.error(gl.getProgramInfoLog(p)); return null; }
    return p;
}

function init(){
    canvas = document.getElementById('glcanvas');
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if(!gl){ alert('WebGL 不可用'); return; }
    resize(); window.addEventListener('resize', resize);
    gl.clearColor(0.05,0.05,0.08,1);

    // 使用全局着色器字符串 from raytrace.js
    program = createProgram(gl, window.rtVertexShader, window.rtFragmentShader);
    if(!program) return;

    // 加载墙面纹理
    scene.wallTexture = loadTexture(gl, 'textures/wall.jpg');

    // full-screen triangle
    const verts = new Float32Array([-1,-1, 3,-1, -1,3]);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);

    // 初始化场景数据与物理
    initScene();
    initInteraction();
    // 创建光源可视化把手
    createLightHandles();
    // 创建光源控制面板
    createLightUI();

    requestAnimationFrame(loop);
}

// ---------- Light handle UI & interaction ----------
let lightHandles = [];
let draggingLight = -1;
function createLightHandles(){
    // 清理旧的
    lightHandles.forEach(h=>{ if(h.el && h.el.parentNode) h.el.parentNode.removeChild(h.el); });
    lightHandles = [];
    const container = document.body;
    for(let i=0;i<scene.lights.length;i++){
        const h = document.createElement('div');
        h.className = 'light-handle';
        h.style.position = 'absolute';
        h.style.width = '14px';
        h.style.height = '14px';
        h.style.borderRadius = '50%';
        h.style.pointerEvents = 'auto';
        h.style.boxShadow = '0 0 8px rgba(0,0,0,0.6)';
        h.style.transform = 'translate(-50%,-50%)';
        h.style.cursor = 'grab';
        const col = scene.lights[i].color;
        h.style.background = `rgb(${Math.floor(col[0]*255)},${Math.floor(col[1]*255)},${Math.floor(col[2]*255)})`;
        h.dataset.idx = i;
        container.appendChild(h);
        h.addEventListener('mousedown', (ev)=>{ ev.preventDefault(); draggingLight = parseInt(h.dataset.idx); h.style.cursor='grabbing'; });
        lightHandles.push({ el: h });
    }
    // global mouse handlers
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', ()=>{ if(draggingLight>=0){ const el = lightHandles[draggingLight].el; if(el) el.style.cursor='grab'; } draggingLight = -1; });
}

function onMouseMove(e){
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if(draggingLight >= 0){
        // project mouse to world ray and intersect with horizontal plane y = lightHeight
        const cam = scene.camera.position;
        const target = scene.camera.target;
        const w = canvas.width, h = canvas.height;
        const uvx = (mx - 0.5*w)/Math.min(w,h);
        const uvy = (my - 0.5*h)/Math.min(w,h);
        const f = normalizeVector([target[0]-cam[0], target[1]-cam[1], target[2]-cam[2]]);
        const r = normalizeVector(crossProduct([0,1,0], f));
        const u = crossProduct(f, r);
        const rd = normalizeVector([f[0] + uvx*r[0] + uvy*u[0], f[1] + uvx*r[1] + uvy*u[1], f[2] + uvx*r[2] + uvy*u[2]]);
        const light = scene.lights[draggingLight];
        const ly = light.position[1];
        if(Math.abs(rd[1]) > 1e-4){
            const t = (ly - cam[1]) / rd[1];
            if(t > 0){
                const nx = cam[0] + rd[0]*t;
                const nz = cam[2] + rd[2]*t;
                light.position[0] = nx;
                light.position[2] = nz;
            }
        }
    }
}

function worldToScreen(pos){
    const cam = scene.camera.position;
    const target = scene.camera.target;
    const f = normalizeVector([target[0]-cam[0], target[1]-cam[1], target[2]-cam[2]]);
    const r = normalizeVector(crossProduct([0,1,0], f));
    const u = crossProduct(f, r);
    const w = canvas.width, h = canvas.height;
    const minwh = Math.min(w,h);
    const dir = [pos[0]-cam[0], pos[1]-cam[1], pos[2]-cam[2]];
    // express dir in camera basis
    const x = dotProduct(dir, r);
    const y = dotProduct(dir, u);
    const z = dotProduct(dir, f);
    // projected rd = normalize(f + (x/minwh) * r + (y/minwh) * u) but we want approximate screen uv
    // approximate ndc coords:
    const ndcX = x / (minwh * z) ;
    const ndcY = y / (minwh * z) ;
    const sx = (ndcX * 0.5 + 0.5) * w;
    const sy = (ndcY * 0.5 + 0.5) * h;
    return [sx, sy, z];
}

// ---------- Light UI controls ----------
let selectedLightIndex = 0;
let lightUIPanel = null;
function createLightUI(){
    if(lightUIPanel && lightUIPanel.parentNode) lightUIPanel.parentNode.removeChild(lightUIPanel);
    lightUIPanel = document.createElement('div');
    lightUIPanel.id = 'light-ui-panel';
    lightUIPanel.style.position = 'fixed';
    lightUIPanel.style.right = '12px';
    lightUIPanel.style.top = '12px';
    lightUIPanel.style.width = '220px';
    lightUIPanel.style.background = 'rgba(20,20,28,0.95)';
    lightUIPanel.style.color = '#ddd';
    lightUIPanel.style.padding = '10px';
    lightUIPanel.style.borderRadius = '8px';
    lightUIPanel.style.fontFamily = 'sans-serif';
    lightUIPanel.style.zIndex = 2000;

    const title = document.createElement('div'); title.textContent = 'Lights'; title.style.fontWeight='600'; title.style.marginBottom='8px';
    lightUIPanel.appendChild(title);

    const select = document.createElement('select'); select.style.width='100%'; select.style.marginBottom='8px';
    function rebuildSelect(){
        select.innerHTML = '';
        scene.lights.forEach((L,i)=>{ const opt = document.createElement('option'); opt.value = i; opt.text = 'Light ' + i; select.appendChild(opt); });
        selectedLightIndex = Math.min(selectedLightIndex, Math.max(0, scene.lights.length-1));
        select.value = selectedLightIndex;
        updateUIFields();
    }
    select.addEventListener('change', ()=>{ selectedLightIndex = parseInt(select.value); updateUIFields(); });
    lightUIPanel.appendChild(select);

    // color
    const colorLabel = document.createElement('div'); colorLabel.textContent='Color'; colorLabel.style.fontSize='12px';
    const colorInput = document.createElement('input'); colorInput.type='color'; colorInput.style.width='100%'; colorInput.style.marginBottom='8px';
    colorInput.addEventListener('input', ()=>{
        const hex = colorInput.value; const rgb = hexToRgb(hex); if(!rgb) return; const L = scene.lights[selectedLightIndex]; L.color = [rgb.r/255, rgb.g/255, rgb.b/255]; });
    lightUIPanel.appendChild(colorLabel); lightUIPanel.appendChild(colorInput);

    // intensity
    const intLabel = document.createElement('div'); intLabel.textContent='Intensity'; intLabel.style.fontSize='12px';
    const intInput = document.createElement('input'); intInput.type='range'; intInput.min='0'; intInput.max='4'; intInput.step='0.01'; intInput.style.width='100%'; intInput.style.marginBottom='8px';
    intInput.addEventListener('input', ()=>{ const L = scene.lights[selectedLightIndex]; L.intensity = parseFloat(intInput.value); });
    lightUIPanel.appendChild(intLabel); lightUIPanel.appendChild(intInput);

    // height
    const hLabel = document.createElement('div'); hLabel.textContent='Height'; hLabel.style.fontSize='12px';
    const hInput = document.createElement('input'); hInput.type='range'; hInput.min='0'; hInput.max='10'; hInput.step='0.1'; hInput.style.width='100%'; hInput.style.marginBottom='8px';
    hInput.addEventListener('input', ()=>{ const L = scene.lights[selectedLightIndex]; L.position[1] = parseFloat(hInput.value); });
    lightUIPanel.appendChild(hLabel); lightUIPanel.appendChild(hInput);

    // buttons
    const btnRow = document.createElement('div'); btnRow.style.display='flex'; btnRow.style.gap='8px';
    const addBtn = document.createElement('button'); addBtn.textContent='Add'; addBtn.style.flex='1';
    const remBtn = document.createElement('button'); remBtn.textContent='Remove'; remBtn.style.flex='1';
    addBtn.addEventListener('click', ()=>{
        const pos = [scene.camera.target[0], 6.0, scene.camera.target[2]];
        scene.lights.push({ position: pos, color: [1,1,1], intensity: 1.0 });
        rebuildSelect(); createLightHandles();
    });
    remBtn.addEventListener('click', ()=>{
        if(scene.lights.length<=1) return; scene.lights.splice(selectedLightIndex,1); selectedLightIndex = Math.max(0, selectedLightIndex-1); rebuildSelect(); createLightHandles();
    });
    btnRow.appendChild(addBtn); btnRow.appendChild(remBtn); lightUIPanel.appendChild(btnRow);

    document.body.appendChild(lightUIPanel);

    function updateUIFields(){
        if(scene.lights.length===0) return;
        const L = scene.lights[selectedLightIndex];
        colorInput.value = rgbToHex(Math.floor(L.color[0]*255), Math.floor(L.color[1]*255), Math.floor(L.color[2]*255));
        intInput.value = (L.intensity !== undefined) ? L.intensity : 1.0;
        hInput.value = L.position[1];
    }
    rebuildSelect();
}

function hexToRgb(hex){
    if(hex.charAt(0)==='#') hex = hex.substr(1);
    if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
    const num = parseInt(hex,16); return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
}
function rgbToHex(r,g,b){ return '#' + [r,g,b].map(x=>{ const s = x.toString(16); return s.length===1 ? '0'+s : s; }).join(''); }



function resize(){
    canvas.width = window.innerWidth; canvas.height = window.innerHeight; gl.viewport(0,0,canvas.width,canvas.height);
}

function initScene(){
    // controlled glass sphere
    scene.spheres = [];
    scene.spheres.push({ position:[0,1,0], velocity:[0,0,0], radius:1.0, color:[0.8,0.9,1.0], isPlayer:true, isTransparent:true, refractiveIndex:1.5, specular:1.0, roughness:0.15 });
    // other small spheres
    for(let i=0;i<8;i++){
        scene.spheres.push({ position:[(Math.random()*16-8),0.8,(Math.random()*16-8)], velocity:[(Math.random()-0.5)*0.08,0,(Math.random()-0.5)*0.08], radius:0.6, color:[Math.random(),Math.random(),Math.random()], isPlayer:false, isTransparent:false, refractiveIndex:1.0, specular:0.6, roughness:0.4 });
    }
    // 增加一些更小的高光球体
    for(let i=0;i<6;i++){
        scene.spheres.push({ position:[(Math.random()*12-6),0.4,(Math.random()*12-6)], velocity:[0,0,0], radius:0.25, color:[0.9,0.8,0.6], isPlayer:false, isTransparent:false, refractiveIndex:1.0, specular:0.9, roughness:0.05 });
    }
    // 场地四周墙壁（用于物理碰撞）
    scene.walls = [];
    // 前后左右 四面墙 (position is a point on plane)
    scene.walls.push({ position:[0,0,-10], normal:[0,0,1] });
    scene.walls.push({ position:[0,0,10], normal:[0,0,-1] });
    scene.walls.push({ position:[-10,0,0], normal:[1,0,0] });
    scene.walls.push({ position:[10,0,0], normal:[-1,0,0] });
    // 地面和天花
    scene.walls.push({ position:[0,0,0], normal:[0,1,0] });
    scene.walls.push({ position:[0,10,0], normal:[0,-1,0] });
}
    // 将点光源放置在垂直墙面上（每面两个灯），高度固定
    scene.lights = [];
    const wallLightsHeight = 6.0;
    scene.walls.forEach(w => {
        // 只对垂直墙面（normal 的 y 分量接近 0）放置灯
        if(Math.abs(w.normal[1]) < 0.5){
            // 切线方向（在 xz 平面上与法线垂直）
            const tang = [-w.normal[2], 0, w.normal[0]];
            for(let k=0;k<2;k++){
                // 在墙面上沿切线分布两个灯（从 -6 到 +6）
                const t = -6 + k * 12;
                const pos = [
                    w.position[0] + w.normal[0] * 0.5 + tang[0] * (t / 10.0),
                    wallLightsHeight,
                    w.position[2] + w.normal[2] * 0.5 + tang[2] * (t / 10.0)
                ];
                const col = (k % 2 === 0) ? [1.0,0.95,0.8] : [0.8,0.9,1.0];
                scene.lights.push({ position: pos, color: col, intensity: 1.0 });
            }
        }
    });
    if(scene.lights.length === 0) scene.lights = [ { position: [5,8,2], color: [1.0,1.0,1.0], intensity: 1.0 } ];
}
function uploadAndDraw(time){
    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program,'u_resolution'), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(program,'u_time'), time*0.001);
    gl.uniform3fv(gl.getUniformLocation(program,'u_camPos'), new Float32Array(scene.camera.position));
    gl.uniform3fv(gl.getUniformLocation(program,'u_camTarget'), new Float32Array(scene.camera.target));
    // upload lights
    const lightCount = Math.min(8, scene.lights ? scene.lights.length : 0);
    gl.uniform1i(gl.getUniformLocation(program,'u_lightCount'), lightCount);
    const lightPosArr = new Float32Array(8*3);
    const lightColArr = new Float32Array(8*3);
    for(let i=0;i<8;i++){
        if(i<lightCount){ const L = scene.lights[i]; lightPosArr.set(L.position, i*3); const col = L.color; const inten = (L.intensity!==undefined)?L.intensity:1.0; lightColArr.set([col[0]*inten, col[1]*inten, col[2]*inten], i*3); }
        else { lightPosArr.set([0,0,0], i*3); lightColArr.set([0,0,0], i*3); }
    }
    const locLP = gl.getUniformLocation(program,'u_lightPos'); if(locLP) gl.uniform3fv(locLP, lightPosArr);
    const locLC = gl.getUniformLocation(program,'u_lightColor'); if(locLC) gl.uniform3fv(locLC, lightColArr);
    const max = window.RT_MAX_SPHERES || 16;
    const count = Math.min(max, scene.spheres.length);
    gl.uniform1i(gl.getUniformLocation(program,'u_sphereCount'), count);
    const posArr = new Float32Array(max*4);
    const matArr = new Float32Array(max*4);
    const specArr = new Float32Array(max);
    const roughArr = new Float32Array(max);
    for(let i=0;i<max;i++){
        if(i<count){
            const s = scene.spheres[i]; posArr[i*4+0]=s.position[0]; posArr[i*4+1]=s.position[1]; posArr[i*4+2]=s.position[2]; posArr[i*4+3]=s.radius;
            matArr[i*4+0]=s.color[0]; matArr[i*4+1]=s.color[1]; matArr[i*4+2]=s.color[2]; matArr[i*4+3]=s.isTransparent?1.0:0.0;
            specArr[i] = s.specular !== undefined ? s.specular : 0.5;
            roughArr[i] = s.roughness !== undefined ? s.roughness : 0.5;
        } else { posArr.set([0,0,0,0], i*4); matArr.set([0,0,0,0], i*4); }
    }
    // set arrays (use location of [0])
    const locPos = gl.getUniformLocation(program,'u_spheres[0]'); if(locPos) gl.uniform4fv(locPos, posArr);
    const locMat = gl.getUniformLocation(program,'u_mat[0]'); if(locMat) gl.uniform4fv(locMat, matArr);
    const locSpec = gl.getUniformLocation(program,'u_spec[0]'); if(locSpec) gl.uniform1fv(locSpec, specArr);
    const locRough = gl.getUniformLocation(program,'u_rough[0]'); if(locRough) gl.uniform1fv(locRough, roughArr);

    // 绑定墙纹理到 unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.wallTexture);
    const wallLoc = gl.getUniformLocation(program, 'u_wallTex'); if(wallLoc) gl.uniform1i(wallLoc, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // update light handle DOM positions
    if(lightHandles.length !== scene.lights.length) createLightHandles();
    const rect = canvas.getBoundingClientRect();
    for(let i=0;i<scene.lights.length;i++){
        const pos = scene.lights[i].position;
        const el = lightHandles[i] && lightHandles[i].el;
        if(!el) continue;
        const sc = worldToScreen(pos);
        const sx = sc[0], sy = sc[1], depth = sc[2];
        if(depth <= 0.01){ el.style.display = 'none'; } else { el.style.display = 'block'; el.style.left = (rect.left + sx) + 'px'; el.style.top = (rect.top + sy) + 'px'; }
    }
}

let lastTime = 0;
function loop(t){
    // physics step (use existing updatePhysics from physics.js)
    updatePhysics();
    // render
    uploadAndDraw(t);
    requestAnimationFrame(loop);
}

window.onload = init;