// Tapa los huecos del robot: cada borde abierto se cierra con un abanico desde su centro (UV, huesos y pesos del vértice de borde más cercano).
// Uso: node scripts/fill-holes.mjs entrada.glb salida.glb (se usó para public/models/characters/robot.glb, Claudito)
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder,MeshoptEncoder} from 'meshoptimizer'; await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
import {dequantize,meshopt,weld} from '@gltf-transform/functions';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const [src,out]=process.argv.slice(2);
const doc=await io.read(src); await doc.transform(dequantize());
const p=doc.getRoot().listMeshes()[0].listPrimitives()[0];const pos=p.getAttribute('POSITION');let A=Array.from(p.getIndices().getArray());
const pk=i=>pos.getElement(i,[]).map(x=>x.toFixed(5)).join();
const id=new Map(),canon=[],rep=[];for(let i=0;i<pos.getCount();i++){const k=pk(i);if(!id.has(k)){id.set(k,id.size);rep.push(i);}canon.push(id.get(k));}
const E=new Map();for(let t=0;t<A.length;t+=3)for(const[i,j]of[[0,1],[1,2],[2,0]]){const a=canon[A[t+i]],b=canon[A[t+j]];const k=a<b?a+'_'+b:b+'_'+a;const e=E.get(k);if(e)e.n++;else E.set(k,{n:1,from:A[t+i],to:A[t+j]});}
// borde dirigido: el relleno va al revés (to -> from)
const next=new Map();for(const e of E.values())if(e.n==1){const a=canon[e.to];(next.get(a)||next.set(a,[]).get(a)).push(e);}
const used=new Set();const loops=[];
for(const [s,list] of next)for(const e0 of list){if(used.has(e0))continue;const loop=[];let e=e0,ok=true;
  while(!used.has(e)){used.add(e);loop.push(e);const c=next.get(canon[e.from]);if(!c){ok=false;break;}e=c.find(x=>!used.has(x))||c[0];}
  if(ok&&loop.length>=3)loops.push(loop);}
const attrs=p.listSemantics();const data={};for(const s of attrs){const a=p.getAttribute(s);data[s]=[];for(let i=0;i<a.getCount();i++)data[s].push(a.getElement(i,[]));}
let nv=pos.getCount(),filled=0,tris=0;
for(const loop of loops){if(loop.length>80)continue;
  const vs=loop.map(e=>e.to);const c=[0,0,0];for(const v of vs){const q=data.POSITION[v];c[0]+=q[0];c[1]+=q[1];c[2]+=q[2];}c.forEach((_,k)=>c[k]/=vs.length);
  let best=vs[0],bd=1e9;for(const v of vs){const q=data.POSITION[v];const d=Math.hypot(q[0]-c[0],q[1]-c[1],q[2]-c[2]);if(d<bd){bd=d;best=v;}}
  // normal del parche (Newell)
  const nn=[0,0,0];for(let i=0;i<vs.length;i++){const a=data.POSITION[loop[i].to],b=data.POSITION[loop[i].from];nn[0]+=(a[1]-b[1])*(a[2]+b[2]);nn[1]+=(a[2]-b[2])*(a[0]+b[0]);nn[2]+=(a[0]-b[0])*(a[1]+b[1]);}
  const L=Math.hypot(...nn)||1;
  for(const s of attrs){data[s].push(s==='POSITION'?c:s==='NORMAL'?nn.map(x=>x/L):[...data[s][best]]);}
  const ci=nv++;
  for(const e of loop){A.push(e.to,e.from,ci);tris++;}
  filled++;}
for(const s of attrs){const a=p.getAttribute(s);const T=a.getArray().constructor;const sz=a.getElementSize();const arr=new T(data[s].length*sz);data[s].forEach((v,i)=>arr.set(v,i*sz));a.setArray(arr);}
p.getIndices().setArray(new Uint32Array(A));
console.log('huecos',loops.length,'tapados',filled,'tris nuevos',tris);
await doc.transform(meshopt({encoder:MeshoptEncoder,level:'high'}));
await io.write(out,doc);
