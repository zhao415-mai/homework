// physicsWorker.js - runs physics simulation in a Web Worker
let state = { spheres: [], boxMin: [-6,0,-6], boxMax: [6,6,6] };
let running = false;
let lastTime = null;

function rand(min,max){ return min + Math.random()*(max-min); }

function init(data){
  state.spheres = data.spheres;
  state.boxMin = data.boxMin;
  state.boxMax = data.boxMax;
  lastTime = performance.now();
}

function stepPhysics(dt, input){
  // input: control movement vector for player {mv: [x,z]}
  const player = state.spheres[0];
  const speed = 3.0;
  // apply control
  if(input){
    const mv = input.mv || [0,0];
    // yaw passed in input
    const yaw = input.yaw || 0;
    const yawRad = yaw*Math.PI/180.0;
    const forward = [Math.sin(yawRad), 0, -Math.cos(yawRad)];
    const right = [Math.cos(yawRad), 0, Math.sin(yawRad)];
    player.vel[0] += (forward[0]*mv[1] + right[0]*mv[0])*speed*dt*2.0;
    player.vel[2] += (forward[2]*mv[1] + right[2]*mv[0])*speed*dt*2.0;
  }
  // damping
  for(let s of state.spheres){ s.vel[0]*=0.995; s.vel[1]*=0.995; s.vel[2]*=0.995; }
  // gravity (downwards)
  const GRAVITY = 9.8 * 0.6; // scaled down for nicer feel
  for(let s of state.spheres){ s.vel[1] -= GRAVITY * dt; }
  // integrate
  for(let s of state.spheres){ s.pos[0] += s.vel[0]*dt; s.pos[1] += s.vel[1]*dt; s.pos[2] += s.vel[2]*dt; }

  // collisions: sphere-sphere
  for(let i=0;i<state.spheres.length;i++){
    for(let j=i+1;j<state.spheres.length;j++){
      const A = state.spheres[i], B = state.spheres[j];
      const dx = B.pos[0]-A.pos[0], dy = B.pos[1]-A.pos[1], dz = B.pos[2]-A.pos[2];
      const dist2 = dx*dx+dy*dy+dz*dz;
      const rsum = A.r + B.r;
      if(dist2 < (rsum*rsum) && dist2>0.0001){
        const dist = Math.sqrt(dist2);
        const nx = dx/dist, ny = dy/dist, nz = dz/dist;
        const overlap = 0.5*(rsum - dist);
        A.pos[0] -= nx*overlap; A.pos[1] -= ny*overlap; A.pos[2] -= nz*overlap;
        B.pos[0] += nx*overlap; B.pos[1] += ny*overlap; B.pos[2] += nz*overlap;
        const va = A.vel[0]*nx + A.vel[1]*ny + A.vel[2]*nz;
        const vb = B.vel[0]*nx + B.vel[1]*ny + B.vel[2]*nz;
        const m1 = A.r*A.r, m2 = B.r*B.r;
        const u1 = (va*(m1 - m2) + 2.0*m2*vb)/(m1+m2);
        const u2 = (vb*(m2 - m1) + 2.0*m1*va)/(m1+m2);
        const dv1 = (u1 - va); const dv2 = (u2 - vb);
        A.vel[0] += dv1*nx; A.vel[1] += dv1*ny; A.vel[2] += dv1*nz;
        B.vel[0] += dv2*nx; B.vel[1] += dv2*ny; B.vel[2] += dv2*nz;
      }
    }
  }

  // wall collisions
  for(let s of state.spheres){
    const pad = 1e-3;
    if(s.pos[0] - s.r < state.boxMin[0]){ s.pos[0] = state.boxMin[0] + s.r + pad; s.vel[0] = -s.vel[0]*0.9; }
    if(s.pos[0] + s.r > state.boxMax[0]){ s.pos[0] = state.boxMax[0] - s.r - pad; s.vel[0] = -s.vel[0]*0.9; }
    if(s.pos[2] - s.r < state.boxMin[2]){ s.pos[2] = state.boxMin[2] + s.r + pad; s.vel[2] = -s.vel[2]*0.9; }
    if(s.pos[2] + s.r > state.boxMax[2]){ s.pos[2] = state.boxMax[2] - s.r - pad; s.vel[2] = -s.vel[2]*0.9; }
    if(s.pos[1] - s.r < state.boxMin[1]){ s.pos[1] = state.boxMin[1] + s.r + pad; s.vel[1] = -s.vel[1]*0.5; /* lose some energy on ground hit */ }
    if(s.pos[1] + s.r > state.boxMax[1]){ s.pos[1] = state.boxMax[1] - s.r - pad; s.vel[1] = -s.vel[1]*0.6; }
  }
}

onmessage = function(e){
  const d = e.data;
  if(d.type === 'init'){
    init(d.payload);
    postMessage({type:'init-ok'});
  } else if(d.type === 'step'){
    const now = performance.now();
    const dt = d.dt || 0.016;
    stepPhysics(dt, d.input);
    // send positions only
    const out = state.spheres.map(s=>({pos:s.pos, vel:s.vel, r:s.r, color:s.color, player:!!s.player}));
    postMessage({type:'state', state: out});
  } else if(d.type === 'reset'){
    init(d.payload);
    postMessage({type:'init-ok'});
  }
};
