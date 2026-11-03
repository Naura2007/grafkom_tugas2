/* =====================================================================
   TUGAS 2 GRAFIKA KOMPUTER – SCENE TOWER 2 ITS (WebGL2, tanpa library)
   Isi file (cari nomor bagian dengan Ctrl+F):
     1. SETUP & STATE      6. SCENE GRAPH (helper + draw)
     2. MATRIKS            7. OBJEK-OBJEK SCENE
     3. SHADER (lighting)  8. KAMERA
     4. GEOMETRI           9. RENDER LOOP
     5. TEKSTUR
   CONTEKAN CHALLENGE:
     kecepatan mobil -> bagian 1 (car_x, angka 4)   | warna mobil -> bagian 7 (mobil)
     tambah pohon    -> bagian 7 (pohonAll)         | arah/warna matahari -> bagian 9 (sd, uSunCol)
     tekstur baru    -> bagian 5 (tex) + pakai di box('nama',...)
     kinclong        -> properti sp (kekuatan) & sh (kekerasan) pada objek
     jam awal        -> bagian 1 (hour)             | kamera awal -> bagian 8 (cam)
   ===================================================================== */

/* ---------- 1. SETUP & STATE ---------- */
const $ = id => document.getElementById(id);          // singkatan getElementById
const cv = $('gl'), gl = cv.getContext('webgl2');     // canvas & konteks WebGL2

let t = 0;        // waktu animasi (detik), bertambah tiap frame kalau "Animasi" dicentang
let night = 0;    // 0 = siang, 1 = malam (dihitung dari slider jam)
let hour = 10;    // jam awal pada slider (0-24)

// Posisi kendaraan sebagai fungsi waktu (dihitung ulang tiap frame)
const car_x  = () => ((t * 4 + 20) % 40) - 20;   // mobil: kecepatan 4, loop dari x=-20 ke 20
const bike_d = () => t * 3;                      // jarak tempuh motor (kecepatan 3)
const bike_x = () => 20 - (bike_d() % 40);       // motor: arah berlawanan (20 -> -20)

/* ---------- 2. MATRIKS 4x4 (column-major) ---------- */
const I = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);   // identitas

// perkalian matriks a*b
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k*4 + r] * b[c*4 + k];
    o[c*4 + r] = s;
  }
  return o;
}
// Transformasi: translasi, skala, rotasi sumbu X/Y/Z
const T  = (x,y,z) => { const m = I(); m[12]=x; m[13]=y; m[14]=z; return m; };
const S  = (x,y,z) => { const m = I(); m[0]=x; m[5]=y; m[10]=z; return m; };
const RX = a => { const m=I(), c=Math.cos(a), s=Math.sin(a); m[5]=c; m[6]=s; m[9]=-s; m[10]=c; return m; };
const RY = a => { const m=I(), c=Math.cos(a), s=Math.sin(a); m[0]=c; m[2]=-s; m[8]=s; m[10]=c; return m; };
const RZ = a => { const m=I(), c=Math.cos(a), s=Math.sin(a); m[0]=c; m[1]=s; m[4]=-s; m[5]=c; return m; };

// Proyeksi perspektif (fov, aspect, near, far)
function persp(f, a, n, r) {
  const m = new Float32Array(16), t = 1 / Math.tan(f / 2);
  m[0] = t/a; m[5] = t; m[10] = (r+n)/(n-r); m[11] = -1; m[14] = 2*r*n/(n-r);
  return m;
}
// Matriks view: kamera di e, melihat ke c, arah atas u
function lookAt(e, c, u) {
  let z = [e[0]-c[0], e[1]-c[1], e[2]-c[2]], l = Math.hypot(...z);  z = z.map(v => v/l);
  let x = [u[1]*z[2]-u[2]*z[1], u[2]*z[0]-u[0]*z[2], u[0]*z[1]-u[1]*z[0]]; l = Math.hypot(...x); x = x.map(v => v/l);
  const y = [z[1]*x[2]-z[2]*x[1], z[2]*x[0]-z[0]*x[2], z[0]*x[1]-z[1]*x[0]];
  const d = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -d(x,e),-d(y,e),-d(z,e),1]);
}

/* ---------- 3. SHADER = LIGHTING (Phong) ---------- */
// Vertex shader: ubah posisi ke world & clip space, siapkan normal + koordinat tekstur
const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aT;
uniform mat4 uVP, uM; uniform vec2 uUV;
out vec3 vN, vP; out vec2 vUV;
void main(){
  vec4 w = uM * vec4(aP,1.);
  vP = w.xyz;                                   // posisi world (untuk hitung cahaya)
  vN = transpose(inverse(mat3(uM))) * aN;       // normal ikut transformasi
  vUV = aT * uUV;                               // uUV = pengulangan tekstur
  gl_Position = uVP * w;
}`;
// Fragment shader: warna akhir = tekstur x (ambient + diffuse + specular)
const FS = `#version 300 es
precision highp float;
in vec3 vN, vP; in vec2 vUV;
uniform sampler2D uT;
uniform vec3 uCol, uEye, uSunDir, uSunCol, uAmb, uLampPos, uLampCol;
uniform float uSpec, uShin, uEmi;
out vec4 o;
void main(){
  vec3 base = texture(uT, vUV).rgb * uCol;      // warna dasar = tekstur x warna objek
  vec3 N = normalize(vN), V = normalize(uEye - vP);
  if (dot(N,V) < 0.) N = -N;
  // (a) Matahari = directional light
  vec3 L = normalize(uSunDir);
  vec3 c = uAmb*base                                              // ambient
         + uSunCol*( max(dot(N,L),0.)*base                        // diffuse
                   + uSpec*pow(max(dot(N,normalize(L+V)),0.),uShin) ); // specular
  // (b) Lampu jalan = point light dengan atenuasi jarak
  vec3 PL = uLampPos - vP; float d = length(PL); PL /= d;
  float at = 1./(1. + .02*d + .004*d*d);
  c += uLampCol*at*( max(dot(N,PL),0.)*base + uSpec*pow(max(dot(N,normalize(PL+V)),0.),uShin) );
  c += base*uEmi;                               // emissive (benda menyala: lampu, papan nama)
  o = vec4(c,1.);
}`;
function sh(type, src) {
  const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x);
  if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(x));
  return x;
}
const pr = gl.createProgram();
gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(pr); gl.useProgram(pr);
const U = {};   // lokasi semua uniform
['uVP','uM','uUV','uT','uCol','uEye','uSunDir','uSunCol','uAmb','uLampPos','uLampCol','uSpec','uShin','uEmi']
  .forEach(n => U[n] = gl.getUniformLocation(pr, n));

/* ---------- 4. GEOMETRI DASAR ---------- */
// Membuat mesh dari array posisi(p), normal(n), uv(u), index(i) lalu kirim ke GPU
function mesh(p, n, u, i) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  [[p,0,3],[n,1,3],[u,2,2]].forEach(([d, loc, size]) => {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  });
  const e = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, e);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(i), gl.STATIC_DRAW);
  return { vao, n: i.length };
}
// Kubus ukuran 1 (pusat di origin): 6 sisi x 4 titik
function cube() {
  const P=[], N=[], Uv=[], X=[];
  // tiap sisi: [normal, arah-u, arah-v]
  [[[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[-1,0,0],[0,1,0]], [[1,0,0],[0,0,-1],[0,1,0]],
   [[-1,0,0],[0,0,1],[0,1,0]], [[0,1,0],[1,0,0],[0,0,-1]], [[0,-1,0],[1,0,0],[0,0,1]]].forEach(([n,a,b], f) => {
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([s,t]) => {
      P.push(...[0,1,2].map(k => n[k]/2 + a[k]*s/2 + b[k]*t/2)); N.push(...n); Uv.push((s+1)/2, (t+1)/2);
    });
    const o = f*4; X.push(o,o+1,o+2, o,o+2,o+3);
  });
  return mesh(P, N, Uv, X);
}
// Bola radius 1 (latitude-longitude)
function sphere() {
  const P=[], N=[], Uv=[], X=[], A=24, B=16;
  for (let i=0; i<=B; i++) for (let j=0; j<=A; j++) {
    const th=i/B*Math.PI, ph=j/A*2*Math.PI;
    const x=Math.sin(th)*Math.cos(ph), y=Math.cos(th), z=Math.sin(th)*Math.sin(ph);
    P.push(x,y,z); N.push(x,y,z); Uv.push(j/A, i/B);
  }
  for (let i=0; i<B; i++) for (let j=0; j<A; j++) { const a=i*(A+1)+j, b=a+A+1; X.push(a,b,a+1, a+1,b,b+1); }
  return mesh(P, N, Uv, X);
}
// Silinder radius 1, tinggi 1 (sumbu Y) + tutup atas/bawah
function cyl() {
  const P=[], N=[], Uv=[], X=[], A=28;
  for (let j=0; j<=A; j++) {                                   // dinding samping
    const a=j/A*2*Math.PI, c=Math.cos(a), s=Math.sin(a);
    P.push(c,-.5,s, c,.5,s); N.push(c,0,s, c,0,s); Uv.push(j/A,0, j/A,1);
  }
  for (let j=0; j<A; j++) { const o=j*2; X.push(o,o+2,o+1, o+1,o+2,o+3); }
  [[.5,1],[-.5,-1]].forEach(([y, d]) => {                       // tutup (uv bulat -> untuk velg)
    const b = P.length/3; P.push(0,y,0); N.push(0,d,0); Uv.push(.5,.5);
    for (let j=0; j<=A; j++) { const a=j/A*2*Math.PI, c=Math.cos(a), s=Math.sin(a); P.push(c,y,s); N.push(0,d,0); Uv.push(c/2+.5, s/2+.5); }
    for (let j=0; j<A; j++) X.push(b, b+1+j, b+2+j);
  });
  return mesh(P, N, Uv, X);
}
// Kerucut alas radius 1 di y=0, puncak di y=1 (untuk tanaman median)
function cone() {
  const P=[], N=[], Uv=[], X=[], A=16;
  for (let j=0; j<=A; j++) {
    const a=j/A*2*Math.PI, c=Math.cos(a), s=Math.sin(a), l=Math.hypot(c,.5,s);
    P.push(c,0,s, 0,1,0); N.push(c/l,.5/l,s/l, c/l,.5/l,s/l); Uv.push(j/A,0, j/A,1);
  }
  for (let j=0; j<A; j++) { const o=j*2; X.push(o,o+2,o+1, o+1,o+2,o+3); }
  return mesh(P, N, Uv, X);
}
const CU = cube(), SP = sphere(), CY = cyl(), CO = cone();   // mesh siap pakai

/* ---------- 5. TEKSTUR (digambar lewat canvas 2D, tanpa file gambar) ---------- */
const TX = {};   // kumpulan tekstur berdasarkan nama
function tex(name, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);                              // gambar pola
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  TX[name] = t;
}
// bintik acak untuk kesan kasar (rumput, aspal, daun, dinding)
const noise = (g, w, h, col, n, amt) => {
  g.fillStyle = col; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${Math.random()<.5 ? '255,255,255' : '0,0,0'},${Math.random()*amt})`;
    g.fillRect(Math.random()*w, Math.random()*h, 2, 2);
  }
};
tex('plain', 8, 8, (g,w,h) => { g.fillStyle = '#fff'; g.fillRect(0,0,w,h); });   // putih polos (warna dari uCol)
tex('facade', 256, 256, (g,w,h) => {                            // fasad abu-abu Tower 2: kisi diagonal + jendela gelap
  g.fillStyle = '#8b867d'; g.fillRect(0,0,w,h); g.strokeStyle = '#a8a399'; g.lineWidth = 2;
  for (let i=-256; i<512; i+=16) {
    g.beginPath(); g.moveTo(i,0); g.lineTo(i+256,256); g.stroke();
    g.beginPath(); g.moveTo(i+256,0); g.lineTo(i,256); g.stroke();
  }
  g.fillStyle = '#2a2a2c';
  for (let r=0; r<4; r++) for (let c=0; c<4; c++) if ((r*3 + c*5) % 7 !== 0) g.fillRect(c*64+14, r*64+14, 24, 32);
});
tex('teal', 256, 256, (g,w,h) => {                              // menara teal: jalur vertikal + garis lantai
  g.fillStyle = '#5f9097'; g.fillRect(0,0,w,h);
  g.fillStyle = '#3f7078'; for (let i=0; i<4; i++) g.fillRect(i*64+8, 0, 48, h);
  g.fillStyle = '#e8f0f0'; for (let r=0; r<8; r++) g.fillRect(0, r*32, w, 3);
});
tex('roof', 64, 64, (g,w,h) => {                                // atap genteng oranye
  g.fillStyle = '#cf6a3f'; g.fillRect(0,0,w,h);
  g.fillStyle = '#a04e2b'; for (let r=0; r<4; r++) g.fillRect(0, r*16, w, 3);
});
tex('grass',   128, 128, (g,w,h) => noise(g,w,h,'#4e8c3a',900,.25));
tex('asphalt', 128, 128, (g,w,h) => noise(g,w,h,'#47474a',900,.25));
tex('curb', 64, 16, (g,w,h) => { for (let i=0; i<4; i++) { g.fillStyle = i%2 ? '#1e1e1e' : '#f2c230'; g.fillRect(i*16, 0, 16, h); } }); // kerb kuning-hitam
tex('wall', 64, 64, (g,w,h) => noise(g,w,h,'#d9d6cf',150,.1));
tex('glass', 64, 64, (g,w,h) => {                               // kaca gelap (gradasi)
  const gr = g.createLinearGradient(0,0,w,h); gr.addColorStop(0,'#33485a'); gr.addColorStop(1,'#10171e');
  g.fillStyle = gr; g.fillRect(0,0,w,h);
});
tex('leaf', 128, 128, (g,w,h) => noise(g,w,h,'#2f7a2f',700,.3));
tex('bark', 64, 64, (g,w,h) => { g.fillStyle = '#5b3d26'; g.fillRect(0,0,w,h); g.fillStyle = '#3d2918'; for (let i=0; i<10; i++) g.fillRect(Math.random()*w, 0, 3, h); });
tex('lattice', 128, 64, (g,w,h) => {                            // rangka atap gedung
  g.fillStyle = '#c4c8cc'; g.fillRect(0,0,w,h); g.strokeStyle = '#707478'; g.lineWidth = 3;
  for (let i=0; i<=w; i+=16) { g.beginPath(); g.moveTo(i,0); g.lineTo(i,h); g.stroke(); }
  g.beginPath(); g.moveTo(0,h/2); g.lineTo(w,h/2); g.stroke();
});
tex('solar', 64, 64, (g,w,h) => {                               // panel surya: biru + garis sel
  g.fillStyle = '#1b2d5a'; g.fillRect(0,0,w,h); g.strokeStyle = '#8aa0d0'; g.lineWidth = 1;
  for (let i=0; i<=w; i+=16) { g.beginPath(); g.moveTo(i,0); g.lineTo(i,h); g.stroke(); g.beginPath(); g.moveTo(0,i); g.lineTo(w,i); g.stroke(); }
});
tex('rim', 128, 128, (g,w,h) => {                               // velg roda: 5 jari-jari (supaya putaran terlihat)
  g.fillStyle = '#222'; g.fillRect(0,0,w,h); g.fillStyle = '#cfcfcf'; g.beginPath(); g.arc(64,64,58,0,7); g.fill();
  g.fillStyle = '#2a2a2a';
  for (let k=0; k<5; k++) { const a = k*Math.PI*2/5 + .3; g.beginPath(); g.moveTo(64,64); g.arc(64,64,50,a,a+.8); g.closePath(); g.fill(); }
  g.fillStyle = '#888'; g.beginPath(); g.arc(64,64,12,0,7); g.fill();
});
tex('sign', 512, 128, (g,w,h) => {                              // papan "TOWER 2 ITS" + logo
  g.fillStyle = '#8b867d'; g.fillRect(0,0,w,h);
  g.fillStyle = '#1a5fb4'; g.beginPath(); g.arc(64,64,40,0,7); g.fill();
  g.fillStyle = '#f5c518'; g.beginPath(); g.arc(64,64,18,0,7); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.textBaseline = 'middle'; g.fillText('TOWER 2 ITS', 130, 68);
});

/* ---------- 6. SCENE GRAPH: helper + fungsi draw ---------- */
// Node = {mesh, tex, warna c, matriks lokal l, anak k, opsi}. Matriks lokal boleh fungsi (untuk animasi).
const grp = (l, k) => ({ l, k });                               // grup (pivot) tanpa mesh: hanya memindah/memutar anak-anaknya
const P   = (mh, tx, c, l, o = {}) => ({ mesh: mh, t: tx, c, l, ...o });   // node berisi mesh
const box = (tx, c, x, y, z, sx, sy, sz, o) => P(CU, tx, c, mul(T(x,y,z), S(sx,sy,sz)), o);  // kubus: posisi (x,y,z) & ukuran (sx,sy,sz)
const W = [1, 1, 1];                                            // warna putih = tekstur tampil apa adanya
/* Opsi objek: uv:[u,v]=pengulangan tekstur | sp=kekuatan specular | sh=kekerasan specular | e=emissive */

// Gambar node + seluruh anaknya. Matriks world anak = matriks world induk x matriks lokal anak
function draw(n, pm) {
  const L = typeof n.l === 'function' ? n.l() : n.l, m = mul(pm, L);
  if (n.mesh) {
    gl.bindVertexArray(n.mesh.vao);
    gl.uniformMatrix4fv(U.uM, false, m);
    gl.uniform3fv(U.uCol, n.c);
    gl.uniform2fv(U.uUV, n.uv || [1,1]);
    gl.uniform1f(U.uShin, n.sh || 16);
    gl.uniform1f(U.uSpec, n.sp ?? .15);
    gl.uniform1f(U.uEmi, typeof n.e === 'function' ? n.e() : (n.e || 0));
    gl.bindTexture(gl.TEXTURE_2D, TX[n.t]);
    gl.drawElements(gl.TRIANGLES, n.mesh.n, gl.UNSIGNED_SHORT, 0);
  }
  (n.k || []).forEach(c => draw(c, m));                         // rekursi ke anak
}

/* ---------- 7. OBJEK-OBJEK SCENE ---------- */
// (a) LINGKUNGAN: tanah rumput, jalan aspal, kerb kuning-hitam di kedua sisi jalan
const lingkungan = grp(I(), [
  box('grass',   W, 0, -.1, -6, 90, .2, 70, { uv:[30,23], sp:0 }),
  box('asphalt', W, 0, .02, 4.2, 90, .05, 4, { uv:[30,1], sp:.05 }),
  box('curb',    W, 0, .08, 2.0, 90, .16, .4, { uv:[45,1] }),
  box('curb',    W, 0, .08, 6.4, 90, .16, .4, { uv:[45,1] })
]);

// (b) GEDUNG: Tower 2 (fasad abu-abu + rangka atap + menara teal + papan nama) & gedung rendah atap oranye
const gedung = grp(I(), [
  box('facade',  W, -3, 7.5, -12, 10, 15, 5, { uv:[3,5] }),                 // fasad abu-abu
  box('lattice', W, -3, 15.6, -12, 10, 1.2, 5, { uv:[6,1] }),               // rangka di atap
  box('teal',    W, 3.6, 9, -12, 3.4, 18, 5, { uv:[2,6], sp:.4 }),          // menara teal
  box('sign',    W, -3, 13.3, -9.45, 4, 1, .1, { e: () => night*.7 }),      // papan nama (menyala saat malam)
  box('wall',    W, -9, 1.5, -5, 12, 3, 5, { uv:[4,1] }),                   // dinding gedung rendah
  P(CU, 'roof', W, mul(T(-9,3.3,-5), mul(RZ(.08), S(13,.3,6.2))), { uv:[1,8] }), // atap oranye (dimiringkan RZ)
  box('glass',   W, -2, 1.9, -5, 3, 3.8, 4.6, { sp:.8, sh:64 })             // blok kaca gelap
]);

// (c) KENDARAAN — HIERARKI: kendaraan (induk) -> roda (anak) -> ban + velg (cucu)
// wheel(x,z,radius,tebal,fungsiPutar): roda ditempel ke bodi di (x,z), berputar sendiri lewat RZ(-spin)
const wheel = (x, z, r, th, sp) => grp(() => T(x, r, z), [
  grp(() => RZ(-sp()), [                                                            // putaran roda
    P(CY, 'plain', [.08,.08,.08], mul(RX(Math.PI/2), S(r*2, th, r*2))),              // ban hitam
    P(CY, 'rim', W, mul(RX(Math.PI/2), S(r*1.25, th*1.05, r*1.25)), { sp:.6 })       // velg bertekstur
  ])
]);
const mobil = grp(() => T(car_x(), 0, 5), [                     // induk: posisi mobil bergerak
  P(CU, 'plain', [.78,.05,.1], mul(T(0,.8,0), S(4.4,.9,1.9)), { sp:.8, sh:64 }),    // bodi merah (warna di sini)
  P(CU, 'glass', W, mul(T(-.3,1.55,0), S(2.4,.75,1.7)), { sp:.9, sh:80 }),          // kabin kaca
  P(CU, 'plain', [1,1,.8], mul(T(2.21,.85,.6), S(.05,.2,.4)),  { e: () => .4 + night*1.2 }),  // lampu depan kanan
  P(CU, 'plain', [1,1,.8], mul(T(2.21,.85,-.6), S(.05,.2,.4)), { e: () => .4 + night*1.2 }),  // lampu depan kiri
  ...[[1.4,.95],[1.4,-.95],[-1.4,.95],[-1.4,-.95]].map(([x,z]) => wheel(x, z, .4, .4, () => car_x()/.4)) // 4 roda
]);
const motor = grp(() => mul(T(bike_x(), 0, 3.2), RY(Math.PI)), [  // induk: posisi + dihadapkan ke arah -x
  P(CU, 'plain', [.12,.12,.12], mul(T(0,.6,0), S(1.4,.3,.3))),                       // bodi motor
  P(CU, 'plain', [.1,.1,.1], mul(T(-.2,.85,0), S(.7,.12,.3))),                       // jok
  wheel(.75, 0, .33, .12, () => bike_d()/.33), wheel(-.75, 0, .33, .12, () => bike_d()/.33),  // 2 roda
  P(CU, 'plain', [.15,.7,.2], mul(T(-.15,1.3,0), mul(RZ(-.2), S(.4,.7,.5)))),        // badan pengemudi (jaket hijau)
  P(SP, 'plain', [.9,.7,.55], mul(T(0,1.78,0), S(.16,.16,.16))),                     // kepala
  P(SP, 'plain', [.15,.7,.2], mul(T(0,1.85,0), S(.2,.18,.2)))                        // helm hijau
]);

// (d) VEGETASI — HIERARKI: batang (induk) -> tajuk bergoyang -> 3 bola daun
const pohon = (x, z, s) => grp(T(x, 0, z), [                    // s = skala pohon
  P(CY, 'bark', W, mul(T(0,2*s,0), S(.4*s, 4*s, .4*s))),                            // batang
  grp(() => mul(T(0,4*s,0), RZ(Math.sin(t*1.3 + x)*.03)), [                          // tajuk: bergoyang sinus (animasi)
    P(SP, 'leaf', [.9,1,.9], mul(T(0,1.5*s,0), S(2.6*s,2.2*s,2.6*s)), { uv:[3,3], sp:.05 }),
    P(SP, 'leaf', W, mul(T(1.3*s,.7*s,0), S(1.8*s,1.5*s,1.8*s)), { uv:[3,3], sp:.05 }),
    P(SP, 'leaf', W, mul(T(-1.2*s,.6*s,.5*s), S(1.8*s,1.5*s,1.8*s)), { uv:[3,3], sp:.05 })
  ])
]);
const pohonAll = grp(I(), [pohon(17,-2,1.6), pohon(-20,-9,1.4), pohon(-14,-8,1.1)]);  // tambah pohon: pohon(x, z, skala)
const tanaman = grp(I(), Array.from({ length: 12 }, (_, i) =>                          // 12 tanaman median, goyang beda fase
  grp(() => mul(T(-12 + i*1.1, 0, 1), RZ(Math.sin(t*2 + i)*.07)), [
    P(CO, 'plain', [.75,.65,.3], S(.25, 1.2 + (i%3)*.3, .25), { sp:0 })
  ])
));

// (e) LAMPU JALAN SURYA: tiang + 3 panel yang berputar + bola lampu (titik cahaya di LAMP)
const LAMP = [-17.5, 6.9, .8];                                  // posisi point light di dunia
const lampu = grp(T(-18, 0, .8), [
  P(CY, 'plain', [.5,.5,.52], mul(T(0,3.5,0), S(.12,7,.12))),                        // tiang
  grp(() => mul(T(0,7,0), RY(t*.4)), [-1,0,1].map(k =>                               // panel berputar pelan
    P(CU, 'solar', W, mul(T(k*1.1, .4 + Math.abs(k)*.1, 0), mul(RZ(-.35), S(1,.06,1.4))), { sp:.5 }))),
  P(SP, 'plain', [1,.95,.7], mul(T(.5,6.9,0), S(.22,.22,.22)), { e: () => .3 + night*1.5 })  // bola lampu
]);

// ROOT = gabungan semua objek (sesuai tree di index.html)
const root = grp(I(), [lingkungan, gedung, mobil, motor, pohonAll, tanaman, lampu]);

/* ---------- 8. KAMERA ORBIT (drag = putar, scroll = zoom) ---------- */
const cam = { yaw: 0, pitch: .12, dist: 26, tgt: [0, 6, -4] };   // sudut horizontal, vertikal, jarak, titik yang dilihat
function preset(y, p, d) { cam.yaw = y; cam.pitch = p; cam.dist = d; $('follow').checked = false; cam.tgt = [0, 6, -4]; }  // dipakai tombol Depan/Samping/Atas
let drag = null;
cv.onpointerdown = e => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); };
cv.onpointerup = () => drag = null;
cv.onpointermove = e => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag[0]) * .005;
  cam.pitch = Math.max(-.1, Math.min(1.4, cam.pitch + (e.clientY - drag[1]) * .005));
  drag = [e.clientX, e.clientY];
};
cv.onwheel = e => { e.preventDefault(); cam.dist = Math.max(6, Math.min(60, cam.dist * (1 + e.deltaY*.001))); };
$('hour').oninput = e => hour = +e.target.value;                // slider jam

/* ---------- 9. RENDER LOOP ---------- */
let last = 0;
gl.enable(gl.DEPTH_TEST); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(U.uT, 0);
function frame(ms) {
  const dt = Math.min((ms - last)/1000, .1); last = ms;
  if ($('play').checked) t += dt;                                // maju waktu hanya saat animasi aktif

  // ukuran canvas mengikuti layar
  const w = Math.floor(cv.clientWidth * devicePixelRatio), h = Math.floor(cv.clientHeight * devicePixelRatio);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  gl.viewport(0, 0, w, h);

  // siang/malam dari slider jam: matahari terbit jam 6, terbenam jam 18
  const ang = (hour - 6)/12 * Math.PI;
  const day = Math.max(0, Math.min(1, Math.sin(ang)*1.5)); night = 1 - day;
  const sd = [Math.cos(ang)*.8, Math.max(Math.sin(ang), .05), .5];   // arah matahari
  const mix = (a, b) => a.map((v, i) => v*night + b[i]*day);
  const sky = mix([.03,.05,.12], [.62,.78,.92]);                    // warna langit malam -> siang
  gl.clearColor(...sky, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // kamera: bisa mengikuti mobil
  const f = $('follow').checked;
  const tg = f ? [car_x(), 1, 5] : cam.tgt, dd = f ? Math.min(cam.dist, 12) : cam.dist;
  const eye = [tg[0] + dd*Math.sin(cam.yaw)*Math.cos(cam.pitch), tg[1] + dd*Math.sin(cam.pitch), tg[2] + dd*Math.cos(cam.yaw)*Math.cos(cam.pitch)];
  gl.uniformMatrix4fv(U.uVP, false, mul(persp(.9, w/h, .5, 200), lookAt(eye, tg, [0,1,0])));   // proyeksi x view
  gl.uniform3fv(U.uEye, eye);

  // kirim data cahaya ke shader
  gl.uniform3fv(U.uSunDir, sd);                                       // matahari (directional)
  gl.uniform3fv(U.uSunCol, [1*day, .95*day, .85*day]);
  gl.uniform3fv(U.uAmb, mix([.08,.1,.18], [.45,.5,.55]));             // cahaya ambient
  const lk = $('lampon').checked ? 1 : night;                         // lampu nyala saat malam / dipaksa
  gl.uniform3fv(U.uLampPos, LAMP);                                    // lampu jalan (point light)
  gl.uniform3fv(U.uLampCol, [3*lk, 2.5*lk, 1.6*lk]);

  draw(root, I());                                                    // gambar seluruh scene dari root
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);