// 简易 WebGL2 屏幕空间光线追踪演示
(function(){
  'use strict';
  function showError(msg){
    try{
      let el = document.getElementById('errorOverlay');
      if(!el){ el = document.createElement('div'); el.id = 'errorOverlay'; document.body.appendChild(el);
        Object.assign(el.style,{position:'absolute',left:'12px',right:'12px',top:'12px',padding:'12px',background:'rgba(128,0,0,0.85)',color:'#fff','zIndex':99999,'fontFamily':'Arial,Helvetica,sans-serif'});
      }
      el.textContent = msg;
    }catch(e){ console.error('showError failed', e); }
  }
  function setStatus(msg){
    try{
      let el = document.getElementById('statusOverlay');
      if(!el){ el = document.createElement('div'); el.id = 'statusOverlay'; document.body.appendChild(el);
        Object.assign(el.style,{position:'absolute',left:'12px',top:'180px',background:'rgba(0,0,0,0.6)',color:'#fff',padding:'8px',borderRadius:'6px','zIndex':99998,'fontFamily':'Arial,Helvetica,sans-serif','fontSize':'13px'});
      }
      el.textContent = msg;
    }catch(e){ console.error('setStatus failed', e); }
  }
  try{
    const canvas = document.getElementById('glCanvas');
    if(!canvas){ showError('找不到 canvas 元素: id=glCanvas'); return; }
    const gl = canvas.getContext('webgl2');
    if(!gl){ showError('需要支持 WebGL2 的浏览器（或在安全上下文中运行）'); return; }
    setStatus('WebGL2 OK');

  // --- shaders ---
  const vertSrc = `#version 300 es
  precision highp float;
  in vec2 a_pos;
  out vec2 v_uv;
  void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.0,1.0); }
  `;

  const fragSrc = `#version 300 es
  precision highp float;
  #define MAX_SPH 16
  in vec2 v_uv;
  out vec4 outColor;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec3 u_camPos;
  uniform vec3 u_camDir;
  uniform vec3 u_camRight;
  uniform vec3 u_camUp;

  uniform int u_sphCount;
  uniform vec3 u_sphPos[MAX_SPH];
  uniform float u_sphR[MAX_SPH];
  uniform vec3 u_sphColor[MAX_SPH];
  uniform int u_playerIndex;

  uniform int u_lightCount;
  uniform vec3 u_lightPos[4];
  uniform vec3 u_lightColor[4];

  uniform float u_ior;
  uniform float u_pixelSize;
  uniform float u_transparency;
  uniform int u_softSamples;

  uniform vec3 u_boxMin;
  uniform vec3 u_boxMax;

  struct Hit{ float t; int id; vec3 p; vec3 n; };

  float hash12(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }

  bool intersectSphere(vec3 ro, vec3 rd, vec3 c, float r, out float t){
    vec3 oc = ro - c;
    float b = dot(oc, rd);
    float c2 = dot(oc,oc) - r*r;
    float disc = b*b - c2;
    if(disc < 0.0) return false;
    float s = sqrt(disc);
    float t0 = -b - s;
    float t1 = -b + s;
    t = (t0>0.0) ? t0 : ((t1>0.0) ? t1 : 1e20);
    return t<1e19;
  }

  bool intersectBoxPlanes(vec3 ro, vec3 rd, out float t, out vec3 n){
    t = 1e20; n = vec3(0.0);
    for(int i=0;i<6;i++){
      vec3 pn; float planeX; float tt;
      if(i==0){ pn = vec3(-1.0,0.0,0.0); planeX = u_boxMin.x; tt = (planeX - ro.x)/rd.x;
        if(tt>0.0){ vec3 P = ro + rd*tt; if(P.y>=u_boxMin.y-1e-3 && P.y<=u_boxMax.y+1e-3 && P.z>=u_boxMin.z-1e-3 && P.z<=u_boxMax.z+1e-3){ if(tt<t){ t=tt; n=pn; }}} }
      else if(i==1){ pn = vec3(1.0,0.0,0.0); planeX = u_boxMax.x; tt = (planeX - ro.x)/rd.x;
        if(tt>0.0){ vec3 P = ro + rd*tt; if(P.y>=u_boxMin.y-1e-3 && P.y<=u_boxMax.y+1e-3 && P.z>=u_boxMin.z-1e-3 && P.z<=u_boxMax.z+1e-3){ if(tt<t){ t=tt; n=pn; }}} }
      else if(i==2){ pn = vec3(0.0,-1.0,0.0); planeX = u_boxMin.y; tt = (planeX - ro.y)/rd.y;
        if(tt>0.0){ vec3 P = ro + rd*tt; if(P.x>=u_boxMin.x-1e-3 && P.x<=u_boxMax.x+1e-3 && P.z>=u_boxMin.z-1e-3 && P.z<=u_boxMax.z+1e-3){ if(tt<t){ t=tt; n=pn; }}} }
      else if(i==3){ pn = vec3(0.0,1.0,0.0); planeX = u_boxMax.y; tt = (planeX - ro.y)/rd.y;
        if(tt>0.0){ vec3 P = ro + rd*tt; if(P.x>=u_boxMin.x-1e-3 && P.x<=u_boxMax.x+1e-3 && P.z>=u_boxMin.z-1e-3 && P.z<=u_boxMax.z+1e-3){ if(tt<t){ t=tt; n=pn; }}} }
      else if(i==4){ pn = vec3(0.0,0.0,-1.0); planeX = u_boxMin.z; tt = (planeX - ro.z)/rd.z;
        if(tt>0.0){ vec3 P = ro + rd*tt; if(P.x>=u_boxMin.x-1e-3 && P.x<=u_boxMax.x+1e-3 && P.y>=u_boxMin.y-1e-3 && P.y<=u_boxMax.y+1e-3){ if(tt<t){ t=tt; n=pn; }}} }
      else { pn = vec3(0.0,0.0,1.0); planeX = u_boxMax.z; tt = (planeX - ro.z)/rd.z;
        if(tt>0.0){ vec3 P = ro + rd*tt; if(P.x>=u_boxMin.x-1e-3 && P.x<=u_boxMax.x+1e-3 && P.y>=u_boxMin.y-1e-3 && P.y<=u_boxMax.y+1e-3){ if(tt<t){ t=tt; n=pn; }}} }
    }
    return t<1e19;
  }

  Hit trace(vec3 ro, vec3 rd){
    Hit hit; hit.t = 1e20; hit.id = -1;
    for(int i=0;i<u_sphCount;i++){
      float t; if(intersectSphere(ro,rd,u_sphPos[i],u_sphR[i],t)){
        if(t>0.001 && t<hit.t){ hit.t=t; hit.id=i; hit.p=ro+rd*t; hit.n = normalize(hit.p - u_sphPos[i]); }
      }
    }
    float tp; vec3 np;
    if(intersectBoxPlanes(ro,rd,tp,np)){
      if(tp>0.001 && tp<hit.t){ hit.t=tp; hit.id = -2; hit.p = ro + rd*tp; hit.n = np; }
    }
    return hit;
  }

  // trace but skip a sphere by index (to avoid self-intersection when tracing refracted ray)
  Hit traceExclude(vec3 ro, vec3 rd, int skipId){
    Hit hit; hit.t = 1e20; hit.id = -1;
    for(int i=0;i<u_sphCount;i++){
      if(i==skipId) continue;
      float t; if(intersectSphere(ro,rd,u_sphPos[i],u_sphR[i],t)){
        if(t>0.001 && t<hit.t){ hit.t=t; hit.id=i; hit.p=ro+rd*t; hit.n = normalize(hit.p - u_sphPos[i]); }
      }
    }
    float tp; vec3 np;
    if(intersectBoxPlanes(ro,rd,tp,np)){
      if(tp>0.001 && tp<hit.t){ hit.t=tp; hit.id = -2; hit.p = ro + rd*tp; hit.n = np; }
    }
    return hit;
  }

  bool inShadowSample(vec3 p, vec3 lightPos, vec3 dir){
    vec3 ro = p + dir*0.001;
    for(int i=0;i<u_sphCount;i++){
      float t; if(intersectSphere(ro,dir,u_sphPos[i],u_sphR[i],t)){
        if(t>0.001) return true;
      }
    }
    float tp; vec3 np;
    if(intersectBoxPlanes(ro,dir,tp,np)){
      float distToLight = length(lightPos - ro);
      if(tp>0.001 && tp < distToLight) return true;
    }
    return false;
  }

  vec3 sampleLight(vec3 p, vec3 lightPos, vec3 lightCol, int samples){
    float occl = 0.0;
    for(int i=0;i<samples;i++){
      float t = float(i);
      float rnd = hash12(p.xy + vec2(t, u_time));
      vec3 jitter = vec3( (rnd-0.5)*0.5, (rnd-0.5)*0.5, 0.0 );
      vec3 pos = lightPos + jitter;
      vec3 dir = normalize(pos - p);
      if(inShadowSample(p,pos,dir)) occl += 1.0;
    }
    float vis = 1.0 - (occl / float(max(1,samples)));
    return lightCol * vis;
  }

  vec3 envColor(vec3 rd){
    float t = 0.5*(rd.y + 1.0);
    vec3 sky = mix(vec3(0.6,0.75,0.95), vec3(0.9,0.95,1.0), pow(max(0.0,rd.y),0.5));
    float sun = pow(max(0.0, dot(normalize(vec3(0.2,0.95,0.1)), rd)), 200.0);
    return sky + vec3(1.0,0.95,0.8)*sun*1.5;
  }

  // forward-declare helper used for refracted secondary rays
  vec3 shadeSimple(Hit h, vec3 rd);

  vec3 shade(Hit h, vec3 rd){
    if(h.id==-1) return envColor(rd);
    if(h.id==-2){
      vec3 colOut = vec3(0.9);
      // floor: wood/tiles
      if(abs(h.n.y - 1.0) < 0.5){
        vec2 uv = h.p.xz * 0.6;
        vec2 g = floor(uv);
        vec2 f = fract(uv);
        float tile = mod(g.x + g.y, 2.0);
        float row = floor(uv.y * 4.0);
        float stripe = step(0.5, fract(uv.y * 4.0));
        vec3 lightWood = vec3(0.82,0.7,0.55);
        vec3 darkWood = vec3(0.5,0.35,0.2);
        colOut = mix(lightWood, darkWood, tile*0.6 + 0.2*stripe);
        // add subtle grain
        float grain = 0.04 * sin(uv.x*10.0 + uv.y*2.0 + dot(g,g));
        colOut += grain;
        // grout/edge darkening
        float edge = smoothstep(0.02,0.0, min(f.x, f.y));
        colOut = mix(vec3(0.12), colOut, edge);
      } else {
        // walls: brick pattern
        vec2 uvw = (abs(h.n.x) > 0.5) ? h.p.zy : h.p.xy;
        uvw *= 1.2;
        float row = floor(uvw.y);
        float colb = floor(uvw.x + mod(row,2.0)*0.5);
        float mortar = 0.08;
        vec3 brickA = vec3(0.58,0.18,0.12);
        vec3 brickB = vec3(0.45,0.15,0.1);
        float brickMix = mod(colb + row, 2.0);
        vec3 brick = mix(brickA, brickB, brickMix);
        vec2 fracUV = fract(uvw);
        float m = step(mortar, fracUV.x) * step(mortar, fracUV.y);
        colOut = mix(vec3(0.85,0.85,0.85), brick, m);
      }
      vec3 outCol = vec3(0.0);
      for(int li=0; li<u_lightCount; li++){
        vec3 Lp = u_lightPos[li]; vec3 Lc = u_lightColor[li];
        vec3 L = normalize(Lp - h.p);
        float dif = max(0.0,dot(L, h.n));
        vec3 vis = sampleLight(h.p, Lp, Lc, u_softSamples);
        outCol += colOut * (0.12 + 0.88*dif) * vis;
      }
      return outCol;
    }
    vec3 col = u_sphColor[h.id];
    vec3 lit = vec3(0.0);
    for(int li=0; li<u_lightCount; li++){
      vec3 Lp = u_lightPos[li]; vec3 Lc = u_lightColor[li];
      vec3 L = normalize(Lp - h.p);
      float diff = max(0.0, dot(h.n, L));
      vec3 vis = sampleLight(h.p, Lp, Lc, u_softSamples);
      float spec = pow(max(0.0, dot(reflect(-L, h.n), -rd)), 32.0);
      lit += (col * (0.08 + 0.9*diff) + vec3(1.0)*spec*0.6) * vis;
    }
    if(h.id == u_playerIndex){
      // improved glass: trace refracted ray into scene to see objects through the glass
      vec3 N = h.n;
      float cosi = clamp(dot(rd, N), -1.0, 1.0);
      float etai = 1.0;
      float etat = max(0.001, u_ior);
      vec3 n = N;
      if(cosi > 0.0){ // ray inside the surface
        n = -N;
        float tmp = etai; etai = etat; etat = tmp;
      }
      float eta = etai/etat;
      float k = 1.0 - eta*eta*(1.0 - cosi*cosi);
      vec3 refl = reflect(rd, N);
      vec3 rcol = envColor(refl);
      vec3 tcol = envColor(rd);
      if(k >= 0.0){
        vec3 refr = normalize(eta * rd + (eta * cosi - sqrt(k)) * n);
        // secondary trace: shoot refracted ray into scene to get color behind glass
        Hit h2 = traceExclude(h.p + refr * 0.001, refr, u_playerIndex);
        if(h2.id == -1){ tcol = envColor(refr); }
        else { tcol = shadeSimple(h2, refr); }
      }
      // combine using user transparency preference: favor transmitted color when transparency high
      vec3 res = mix(rcol, tcol, clamp(u_transparency, 0.0, 1.0));
          // slight tint
          res = mix(res, vec3(0.95,0.98,1.0), 0.12);
          return res;
    }
    return lit;
  }

  // shadeSimple: non-recursive shading for secondary rays (avoid infinite recursion)
  vec3 shadeSimple(Hit h, vec3 rd){
    if(h.id==-1) return envColor(rd);
    if(h.id==-2){
      vec3 colOut = vec3(0.9);
      if(abs(h.n.y - 1.0) < 0.5){
        vec2 uv = h.p.xz * 0.6;
        vec2 g = floor(uv);
        vec2 f = fract(uv);
        float tile = mod(g.x + g.y, 2.0);
        vec3 lightWood = vec3(0.82,0.7,0.55);
        vec3 darkWood = vec3(0.5,0.35,0.2);
        colOut = mix(lightWood, darkWood, tile*0.6 + 0.2*fract(uv.y*4.0));
        float grain = 0.03 * sin(uv.x*10.0 + uv.y*2.0 + dot(g,g));
        colOut += grain;
        float edge = smoothstep(0.02,0.0, min(f.x, f.y));
        colOut = mix(vec3(0.12), colOut, edge);
      } else {
        vec2 uvw = (abs(h.n.x) > 0.5) ? h.p.zy : h.p.xy;
        uvw *= 1.2;
        float row = floor(uvw.y);
        float colb = floor(uvw.x + mod(row,2.0)*0.5);
        float mortar = 0.08;
        vec3 brickA = vec3(0.58,0.18,0.12);
        vec3 brickB = vec3(0.45,0.15,0.1);
        float brickMix = mod(colb + row, 2.0);
        vec3 brick = mix(brickA, brickB, brickMix);
        vec2 fracUV = fract(uvw);
        float m = step(mortar, fracUV.x) * step(mortar, fracUV.y);
        colOut = mix(vec3(0.85,0.85,0.85), brick, m);
      }
      vec3 outCol = vec3(0.0);
      for(int li=0; li<u_lightCount; li++){
        vec3 Lp = u_lightPos[li]; vec3 Lc = u_lightColor[li];
        vec3 L = normalize(Lp - h.p);
        float dif = max(0.0,dot(L, h.n));
        vec3 vis = sampleLight(h.p, Lp, Lc, u_softSamples);
        outCol += colOut * (0.12 + 0.88*dif) * vis;
      }
      return outCol;
    }
    vec3 col = u_sphColor[h.id];
    vec3 lit = vec3(0.0);
    for(int li=0; li<u_lightCount; li++){
      vec3 Lp = u_lightPos[li]; vec3 Lc = u_lightColor[li];
      vec3 L = normalize(Lp - h.p);
      float diff = max(0.0, dot(h.n, L));
      vec3 vis = sampleLight(h.p, Lp, Lc, u_softSamples);
      float spec = pow(max(0.0, dot(reflect(-L, h.n), -rd)), 32.0);
      lit += (col * (0.08 + 0.9*diff) + vec3(1.0)*spec*0.6) * vis;
    }
    return lit;
  }

  void main(){
    vec2 uv0 = v_uv;
    if(u_pixelSize > 1.0){
      vec2 px = u_resolution * u_pixelSize;
      uv0 = floor(v_uv * px) / px;
    }
    vec2 uv = (uv0 * 2.0 - 1.0);
    float aspect = u_resolution.x / u_resolution.y;
    vec3 rd = normalize(u_camDir + uv.x*aspect*u_camRight + uv.y*u_camUp);
    vec3 ro = u_camPos;
    Hit h = trace(ro, rd);
    vec3 col = shade(h, rd);
    outColor = vec4(sqrt(clamp(col,0.0,10.0)),1.0);
  }
  `;

  // --- helper funcs ---
  function compileShader(gl, src, type){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      const log = gl.getShaderInfoLog(s);
      console.error(log);
      showError('着色器编译错误： ' + log);
      throw new Error('shader compile error: ' + log);
    }
    return s;
  }
  function linkProgram(gl, vs, fs){
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
      const log = gl.getProgramInfoLog(p);
      console.error(log);
      showError('着色器链接错误： ' + log);
      throw new Error('program link error: ' + log);
    }
    return p;
  }

  const vs = compileShader(gl, vertSrc, gl.VERTEX_SHADER);
  const fs = compileShader(gl, fragSrc, gl.FRAGMENT_SHADER);
  const prog = linkProgram(gl, vs, fs);
  gl.useProgram(prog);

  // fullscreen quad
  const quadVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);

  // uniforms
  const uni = {
    resolution: gl.getUniformLocation(prog,'u_resolution'),
    time: gl.getUniformLocation(prog,'u_time'),
    camPos: gl.getUniformLocation(prog,'u_camPos'),
    camDir: gl.getUniformLocation(prog,'u_camDir'),
    camRight: gl.getUniformLocation(prog,'u_camRight'),
    camUp: gl.getUniformLocation(prog,'u_camUp'),
    sphCount: gl.getUniformLocation(prog,'u_sphCount'),
    sphPos: gl.getUniformLocation(prog,'u_sphPos'),
    sphR: gl.getUniformLocation(prog,'u_sphR'),
    sphColor: gl.getUniformLocation(prog,'u_sphColor'),
    playerIndex: gl.getUniformLocation(prog,'u_playerIndex'),
    lightCount: gl.getUniformLocation(prog,'u_lightCount'),
    lightPos: gl.getUniformLocation(prog,'u_lightPos'),
    lightColor: gl.getUniformLocation(prog,'u_lightColor'),
    ior: gl.getUniformLocation(prog,'u_ior'),
    transparency: gl.getUniformLocation(prog,'u_transparency'),
    pixelSize: gl.getUniformLocation(prog,'u_pixelSize'),
    softSamples: gl.getUniformLocation(prog,'u_softSamples'),
    boxMin: gl.getUniformLocation(prog,'u_boxMin'),
    boxMax: gl.getUniformLocation(prog,'u_boxMax')
  };

  // scene & physics
  const MAX_SPH = 16;
  let spheres = [];
  let worker = null;
  const boxMin = [-6,0,-6];
  const boxMax = [6,6,6];

  function rand(min,max){ return min + Math.random()*(max-min); }

  function resetScene(){
    spheres = [];
    spheres.push({pos:[0.0,1.0,2.0], vel:[0,0,0], r:0.9, color:[1.0,1.0,1.0], player:true});
    for(let i=1;i<10;i++){
      let r = rand(0.25,0.6);
      let x = rand(boxMin[0]+r, boxMax[0]-r);
      let z = rand(boxMin[2]+r, boxMax[2]-r);
      let y = rand(boxMin[1]+r+0.1, boxMax[1]-r-0.1);
      spheres.push({pos:[x,y,z], vel:[rand(-0.8,0.8)*0.2, rand(-0.2,0.2), rand(-0.8,0.8)*0.2], r:r, color:[Math.random()*0.8+0.2, Math.random()*0.8+0.2, Math.random()*0.8+0.2], player:false});
    }
    // initialize worker
    if(worker){
      worker.postMessage({type:'reset', payload:{spheres:spheres, boxMin:boxMin, boxMax:boxMax}});
    }
  }
  resetScene();

  // control
  const keys = {};
  window.addEventListener('keydown', e=>keys[e.key.toLowerCase()]=true);
  window.addEventListener('keyup', e=>keys[e.key.toLowerCase()]=false);

  // UI camera controls
  const yawEl = document.getElementById('yaw');
  const pitchEl = document.getElementById('pitch');
  const distEl = document.getElementById('dist');
  const iorEl = document.getElementById('ior');
  const pixelSizeEl = document.getElementById('pixelSize');
  const softSamplesEl = document.getElementById('softSamples');
  const transpEl = document.getElementById('transparency');
  document.getElementById('reset').addEventListener('click', resetScene);

  let camYaw = 0, camPitch = 20, camDist = 12;
  yawEl.addEventListener('input', ()=>camYaw = parseFloat(yawEl.value));
  pitchEl.addEventListener('input', ()=>camPitch = parseFloat(pitchEl.value));
  distEl.addEventListener('input', ()=>camDist = parseFloat(distEl.value));

  // mouse drag to change yaw/pitch
  let dragging=false, last=[0,0];
  canvas.addEventListener('mousedown', e=>{ dragging=true; last=[e.clientX,e.clientY]; });
  window.addEventListener('mouseup', ()=>dragging=false);
  window.addEventListener('mousemove', e=>{ if(dragging){ camYaw += (e.clientX-last[0])*0.2; camPitch += (e.clientY-last[1])*0.2; last=[e.clientX,e.clientY]; yawEl.value = camYaw; pitchEl.value = camPitch; } });
  canvas.addEventListener('wheel', e=>{ camDist += e.deltaY*0.01; camDist = Math.max(3, Math.min(40, camDist)); distEl.value = camDist; e.preventDefault(); }, {passive:false});

  // resize
  function resize(){
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; gl.viewport(0,0,w,h); }
  }

  // upload sphere uniforms helper
  function uploadSpheres(){
    const N = Math.min(MAX_SPH, spheres.length);
    const posArr = new Float32Array(MAX_SPH*3);
    const rArr = new Float32Array(MAX_SPH);
    const colArr = new Float32Array(MAX_SPH*3);
    for(let i=0;i<MAX_SPH;i++){
      if(i < N){ posArr.set(spheres[i].pos, i*3); rArr[i] = spheres[i].r; colArr.set(spheres[i].color, i*3);
      } else { posArr.set([0, -1000,0], i*3); rArr[i]=0.0; colArr.set([0,0,0], i*3); }
    }
    gl.uniform3fv(uni.sphPos, posArr);
    gl.uniform1fv(uni.sphR, rArr);
    gl.uniform3fv(uni.sphColor, colArr);
    gl.uniform1i(uni.sphCount, N);
    gl.uniform1i(uni.playerIndex, 0);
    setStatus('Spheres: ' + N + ' | Worker: ' + (worker ? 'running' : 'none'));
  }

  // physics worker integration
  function startWorker(){
    if(window.Worker){
      worker = new Worker('js/physicsWorker.js');
      worker.onmessage = function(e){
        const d = e.data;
        if(d.type === 'state'){
          // update local spheres positions
          for(let i=0;i<d.state.length && i<spheres.length;i++){
            spheres[i].pos = d.state[i].pos;
            spheres[i].vel = d.state[i].vel;
          }
        }
      };
      worker.postMessage({type:'init', payload:{spheres:spheres, boxMin:boxMin, boxMax:boxMax}});
    }
  }
  startWorker();

  // physics update
  let lastTime = performance.now();
  function step(){
    const now = performance.now();
    let dt = (now - lastTime)/1000.0; if(dt>0.03) dt=0.03; lastTime = now;
    // build control input for worker
    let mvx=0, mvz=0;
    // swapped W/S controls: W moves backward -> forward depends on user request
    if(keys['w']) mvz += 1; if(keys['s']) mvz -= 1; if(keys['a']) mvx -= 1; if(keys['d']) mvx += 1;
    const input = { mv: [mvx, mvz], yaw: camYaw };
    if(worker){ worker.postMessage({type:'step', dt:dt, input: input}); }
    // also request a state update if no worker
    // (worker will post back asynchronously and update spheres)
  }

  // render loop
  function render(){
    resize();
    step();
    gl.clearColor(0.0,0.0,0.0,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // camera
    camYaw = parseFloat(yawEl.value); camPitch = parseFloat(pitchEl.value); camDist = parseFloat(distEl.value);
    const cy = camYaw * Math.PI/180.0; const cp = camPitch * Math.PI/180.0;
    const px = spheres[0].pos[0], py = spheres[0].pos[1], pz = spheres[0].pos[2];
    const camTarget = [px, py+0.4, pz];
    const camPos = [ camTarget[0] + camDist*Math.cos(cp)*Math.sin(cy), camTarget[1] + camDist*Math.sin(cp), camTarget[2] + camDist*Math.cos(cp)*Math.cos(cy) ];
    const camDir = normalizeVec3([ camTarget[0]-camPos[0], camTarget[1]-camPos[1], camTarget[2]-camPos[2] ]);
    const up = [0,1,0];
    const camRight = normalizeVec3(cross(camDir, up));
    const camUp = normalizeVec3(cross(camRight, camDir));

    gl.uniform2f(uni.resolution, canvas.width, canvas.height);
    gl.uniform1f(uni.time, performance.now()*0.001);
    gl.uniform3fv(uni.camPos, camPos);
    gl.uniform3fv(uni.camDir, camDir);
    gl.uniform3fv(uni.camRight, camRight);
    gl.uniform3fv(uni.camUp, camUp);

    // upload spheres
    uploadSpheres();
    // light and box
    // multiple lights
    const lights = [ {pos:[4.0,5.5,2.0], col:[1.0,0.95,0.9]}, {pos:[-3.0,4.0,-2.0], col:[0.6,0.75,1.0]} ];
    const lightCount = lights.length;
    const lp = new Float32Array(3*4);
    const lc = new Float32Array(3*4);
    for(let i=0;i<4;i++){
      if(i<lightCount){ lp.set(lights[i].pos, i*3); lc.set(lights[i].col, i*3); } else { lp.set([0,10,0], i*3); lc.set([0,0,0], i*3); }
    }
    gl.uniform1i(uni.lightCount, lightCount);
    gl.uniform3fv(uni.lightPos, lp);
    gl.uniform3fv(uni.lightColor, lc);
    gl.uniform3fv(uni.boxMin, boxMin);
    gl.uniform3fv(uni.boxMax, boxMax);

    // material & performance controls
    const ior = parseFloat(iorEl.value);
    const pixelSize = parseFloat(pixelSizeEl.value);
    const softSamples = parseInt(softSamplesEl.value);
    const transparency = parseFloat(transpEl.value);
    gl.uniform1f(uni.ior, ior);
    gl.uniform1f(uni.transparency, transparency);
    gl.uniform1f(uni.pixelSize, pixelSize);
    gl.uniform1i(uni.softSamples, softSamples);

    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    requestAnimationFrame(render);
  }

  // small math helpers
  function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function normalizeVec3(a){ const l = Math.hypot(a[0],a[1],a[2]) || 1.0; return [a[0]/l,a[1]/l,a[2]/l]; }

  // wire uniforms arrays must be created with location type matching shader -- already got uni locations

  // initial call
  requestAnimationFrame(render);

  } catch(e){
    try{ showError((e && e.message) ? e.message : String(e)); }catch(err){ console.error(err); }
    console.error(e);
  }

})();
