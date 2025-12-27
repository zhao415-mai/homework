// 简化的着色器模块（导出着色器源码）
const RT_MAX_SPHERES = 16;

const rtVertexShader = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos*0.5 + 0.5; gl_Position = vec4(a_pos,0.0,1.0); }
`;

const rtFragmentShader = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_sphereCount;
uniform vec4 u_spheres[${RT_MAX_SPHERES}];
uniform vec4 u_mat[${RT_MAX_SPHERES}];
uniform vec3 u_camPos;
uniform int u_lightCount;
const int RT_MAX_LIGHTS = 8;
uniform vec3 u_lightPos[RT_MAX_LIGHTS];
uniform vec3 u_lightColor[RT_MAX_LIGHTS];
uniform float u_spec[${RT_MAX_SPHERES}];
uniform float u_rough[${RT_MAX_SPHERES}];
uniform sampler2D u_wallTex;

const float EPS = 0.0001;

float intersectSphere(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float cval = dot(oc,oc) - r*r;
  float h = b*b - cval;
  if(h<0.0) return -1.0;
  h = sqrt(h);
  float t = -b - h;
  if(t>EPS) return t;
  t = -b + h;
  if(t>EPS) return t;
  return -1.0;
}

// axis-aligned box intersection (box centered at origin)
bool intersectBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t, out vec3 n){
  vec3 inv = 1.0 / rd;
  vec3 t0s = (bmin - ro) * inv;
  vec3 t1s = (bmax - ro) * inv;
  vec3 tsm = min(t0s, t1s);
  vec3 tbm = max(t0s, t1s);
  float tmin = max(max(tsm.x, tsm.y), tsm.z);
  float tmax = min(min(tbm.x, tbm.y), tbm.z);
  if(tmax < max(tmin, 0.0)) return false;
  t = tmin > 0.0 ? tmin : tmax;
  vec3 hit = ro + rd * t;
  // determine normal by checking which slab
  if(abs(hit.x - bmin.x) < 0.001) n = vec3(-1,0,0);
  else if(abs(hit.x - bmax.x) < 0.001) n = vec3(1,0,0);
  else if(abs(hit.y - bmin.y) < 0.001) n = vec3(0,-1,0);
  else if(abs(hit.y - bmax.y) < 0.001) n = vec3(0,1,0);
  else if(abs(hit.z - bmin.z) < 0.001) n = vec3(0,0,-1);
  else n = vec3(0,0,1);
  return true;
}

// check occlusion to light (shadows)
bool occluded(vec3 ro, vec3 rd, float maxDist){
  // spheres
  for(int i=0;i<${RT_MAX_SPHERES};++i){ if(i>=u_sphereCount) break; float t = intersectSphere(ro, rd, u_spheres[i].xyz, u_spheres[i].w); if(t>0.0 && t < maxDist) return true; }
  // box walls (same bounds)
  float tb; vec3 tn;
  if(intersectBox(ro, rd, vec3(-10.0, -1.0, -10.0), vec3(10.0, 10.0, 10.0), tb, tn)){
    if(tb>EPS && tb < maxDist) return true;
  }
  return false;
}

vec3 shadeSphere(int id, vec3 p, vec3 n){
  vec3 col = u_mat[id].rgb;
  float isGlass = u_mat[id].a;
  vec3 view = normalize(u_camPos - p);
  vec3 accum = vec3(0.0);
  float ambient = 0.06;
  float specularStrength = u_spec[id];
  float rough = clamp(u_rough[id], 0.0, 1.0);
  for(int li=0; li<RT_MAX_LIGHTS; ++li){
    if(li>=u_lightCount) break;
    vec3 Lpos = u_lightPos[li];
    vec3 Lcol = u_lightColor[li];
    vec3 L = normalize(Lpos - p);
    float diff = max(dot(n,L), 0.0);
    float shadow = occluded(p + n*EPS, L, length(Lpos - p)) ? 0.25 : 1.0;
    float shininess = mix(8.0, 256.0, 1.0 - rough);
    float spec = pow(max(dot(reflect(-L,n), view), 0.0), shininess) * specularStrength;
    accum += (col * diff * shadow + vec3(spec)) * Lcol;
  }
  if(isGlass > 0.5){
    float fres = pow(1.0 - max(dot(-view,n),0.0), 3.0);
    vec3 env = vec3(0.12,0.14,0.2) + 0.4*col;
    return mix(env * 0.6, env * 1.2, fres) * 1.0 + 0.03*col + accum * 0.3;
  }
  return vec3(ambient)*col + accum;
}

vec3 shadeWall(vec3 p, vec3 n){
  vec2 uv = vec2((p.x + 10.0) / 20.0, (p.z + 10.0) / 20.0);
  vec3 tex = texture(u_wallTex, uv).rgb;
  vec3 base = tex * 0.9;
  vec3 accum = vec3(0.0);
  vec3 emissive = vec3(0.0);
  for(int li=0; li<RT_MAX_LIGHTS; ++li){
    if(li>=u_lightCount) break;
    vec3 Lpos = u_lightPos[li];
    vec3 Lcol = u_lightColor[li];
    vec3 L = normalize(Lpos - p);
    float diff = max(dot(n,L), 0.0);
    float shadow = occluded(p + n*EPS, L, length(Lpos - p)) ? 0.25 : 1.0;
    accum += Lcol * diff * shadow;
    // add a visible glowing spot on the wall near the point light
    // compute distance from hit point to light position and add an emissive term
    float dist = length(p - Lpos);
    float radius = 0.6; // glow radius on wall (tweakable)
    float s = clamp(1.0 - dist / radius, 0.0, 1.0);
    float spot = pow(s, 2.0);
    float facing = max(dot(n, normalize(Lpos - p)), 0.0);
    emissive += Lcol * spot * facing * shadow;
  }
  // combine textured lighting with emissive glow
  return base * (0.2 + 0.8*accum) + emissive * 4.0;
}

vec3 trace(vec3 ro, vec3 rd){
  float tmin = 1e20; int hitType = 0; // 1 sphere, 2 wall
  int hitId = -1; vec3 hitN = vec3(0.0);
  // spheres
  for(int i=0;i<${RT_MAX_SPHERES};++i){ if(i>=u_sphereCount) break; float t = intersectSphere(ro, rd, u_spheres[i].xyz, u_spheres[i].w); if(t>0.0 && t < tmin){ tmin=t; hitType=1; hitId=i; hitN = normalize((ro+rd*t) - u_spheres[i].xyz); } }
  // box walls
  float tb; vec3 tn;
  if(intersectBox(ro, rd, vec3(-10.0, -1.0, -10.0), vec3(10.0, 10.0, 10.0), tb, tn)){
    if(tb>EPS && tb < tmin){ tmin = tb; hitType = 2; hitN = tn; }
  }
  if(hitType==0) return vec3(0.06,0.08,0.12) + 0.6*vec3(0.6,0.7,0.8)*max(0.0,1.0-rd.y);
  vec3 p = ro + rd * tmin;
  if(hitType==1) return shadeSphere(hitId, p, hitN);
  return shadeWall(p, hitN);
}

uniform vec3 u_camTarget;

void main(){
  vec2 uv = (v_uv * u_resolution - 0.5*u_resolution)/min(u_resolution.x,u_resolution.y);
  vec3 cam = u_camPos;
  vec3 target = u_camTarget;
  vec3 f = normalize(target - cam);
  vec3 r = normalize(cross(vec3(0.0,1.0,0.0), f));
  vec3 u = cross(f, r);
  vec3 rd = normalize(f + uv.x * r + uv.y * u);
  vec3 col = trace(cam, rd);
  outColor = vec4(pow(col, vec3(1.0/2.2)), 1.0);
}
`;

// 导出为全局变量（用于普通 <script> 加载）
window.RT_MAX_SPHERES = RT_MAX_SPHERES;
window.rtVertexShader = rtVertexShader;
window.rtFragmentShader = rtFragmentShader;