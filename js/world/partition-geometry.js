// 按墙面边界压缩坐标，再只输出并集的外表面；没有固定分辨率体素，也不按每格留接缝。
// 1=奶油墙面，2=粉色墙裙，3=白色腰线/门框。返回纯数组，便于无WebGL验证。
export function partitionSurfaceData(walls,plan,{shell=false}={}) {
  const solids=[];
  const add=(x0,x1,y0,y1,z0,z1,color)=>solids.push({x0,x1,y0,y1,z0,z1,color});
  const junctions=wallJunctions(walls);
  const layers=[[0,1.2,.28,2],[1.2,1.34,.3,3],[1.34,3.2,.25,1],[3.2,5,.25,1]];
  const segment=(w,a,b,y0,y1,half,color)=>{
    let start=(w.axis==='x'?w.gx:w.gz)+a,end=(w.axis==='x'?w.gx:w.gz)+b;
    // 三面外墙的内侧面位于格线外0~.05米，只有碰到外墙的端点需要延伸。
    if(shell){if(start===0)start=-.3+half;if(w.axis==='x'&&end===plan.cols)end=plan.cols+.3-half;}
    if(w.axis==='x')add(start,end,y0,y1,w.gz-half,w.gz+half,color);
    else add(w.gx-half,w.gx+half,y0,y1,start,end,color);
  };
  for(const [y0,y1,half,color]of layers){
    if(shell){
      add(-.6,plan.cols+.6,y0,y1,-.3-half,-.3+half,color);
      add(-.3-half,-.3+half,y0,y1,-.3,plan.rows+.3,color);
      add(plan.cols+.3-half,plan.cols+.3+half,y0,y1,-.3,plan.rows+.3,color);
    }
    for(const w of walls){
      if(w.kind!=='door'||y0>=3.2)segment(w,0,w.kind==='door'?2:1,y0,y1,half,color);
      else {segment(w,0,.22,y0,y1,half,color);segment(w,1.78,2,y0,y1,half,color);}
    }
    // 两条正交墙都截在中心格点时，L 形外角会缺少四分之一墙厚，
    // 并集虽然没有重叠面，却仍有一道明显的竖槽。逐层补全转角实体，
    // 墙面、墙裙与腰线各自保持原厚度，再统一求外表面。
    for(const p of junctions)add(p.x-half,p.x+half,y0,y1,p.z-half,p.z+half,color);
  }
  // 门框属于同一实体并集，以白色覆盖门柱表面，不叠画两层共面网格。
  for(const w of walls)if(w.kind==='door'){
    segment(w,.155,.22,0,3.2,.3,3);segment(w,1.78,1.845,0,3.2,.3,3);
    segment(w,0,2,3.13,3.25,.29,3);
  }
  if(!solids.length)return {positions:[[],[],[]],normals:[[],[],[]],quads:0,cells:0};
  const unique=values=>[...new Set(values.map(n=>+n.toFixed(5)))].sort((a,b)=>a-b);
  const xs=unique(solids.flatMap(s=>[s.x0,s.x1])),ys=unique(solids.flatMap(s=>[s.y0,s.y1])),zs=unique(solids.flatMap(s=>[s.z0,s.z1]));
  const ix=new Map(xs.map((v,i)=>[v,i])),iy=new Map(ys.map((v,i)=>[v,i])),iz=new Map(zs.map((v,i)=>[v,i]));
  const nx=xs.length-1,ny=ys.length-1,nz=zs.length-1,voxels=new Uint8Array(nx*ny*nz);
  const index=(x,y,z)=>(z*ny+y)*nx+x,at=(x,y,z)=>x<0||x>=nx||y<0||y>=ny||z<0||z>=nz?0:voxels[index(x,y,z)];
  const key=n=>+n.toFixed(5);
  for(const s of solids)for(let z=iz.get(key(s.z0));z<iz.get(key(s.z1));z++)for(let y=iy.get(key(s.y0));y<iy.get(key(s.y1));y++)for(let x=ix.get(key(s.x0));x<ix.get(key(s.x1));x++)voxels[index(x,y,z)]=s.color;
  const positions=[[],[],[]],normals=[[],[],[]];let quads=0;
  for(let axis=0;axis<3;axis++){
    const depths=[nx,ny,nz][axis],nu=[ny,nz,nx][axis],nv=[nz,nx,ny][axis],mask=new Int8Array(nu*nv);
    const sample=(depth,u,v)=>axis===0?at(depth,u,v):axis===1?at(v,depth,u):at(u,v,depth);
    for(let depth=0;depth<=depths;depth++){
      for(let v=0;v<nv;v++)for(let u=0;u<nu;u++){const a=sample(depth-1,u,v),b=sample(depth,u,v);mask[v*nu+u]=a&&!b?a:!a&&b?-b:0;}
      for(let v=0;v<nv;v++)for(let u=0;u<nu;u++){
        const value=mask[v*nu+u];if(!value)continue;
        let width=1,height=1;while(u+width<nu&&mask[v*nu+u+width]===value)width++;
        outer:while(v+height<nv){for(let k=0;k<width;k++)if(mask[(v+height)*nu+u+k]!==value)break outer;height++;}
        for(let j=0;j<height;j++)mask.fill(0,(v+j)*nu+u,(v+j)*nu+u+width);
        const point=(a,b)=>axis===0?[xs[depth],ys[a],zs[b]]:axis===1?[xs[b],ys[depth],zs[a]]:[xs[a],ys[b],zs[depth]];
        const vertices=[point(u,v),point(u+width,v),point(u+width,v+height),point(u,v+height)],normal=[0,0,0];normal[axis]=Math.sign(value);
        const order=value>0?[0,1,2,0,2,3]:[0,2,1,0,3,2],p=positions[Math.abs(value)-1],n=normals[Math.abs(value)-1];
        for(const i of order){p.push(...vertices[i]);n.push(...normal);}quads++;
      }
    }
  }
  return {positions,normals,quads,cells:voxels.length};
}

export function straightWallRun(walls,index){
  const selected=walls[index];if(!selected)return [];
  if(selected.kind==='door')return [index];
  const axis=selected.axis,along=axis==='x'?'gx':'gz',across=axis==='x'?'gz':'gx';
  const line=new Map();walls.forEach((w,i)=>{if(w.kind==='wall'&&w.axis===axis&&w[across]===selected[across])line.set(w[along],i);});
  let a=selected[along],b=a;while(line.has(a-1))a--;while(line.has(b+1))b++;
  return Array.from({length:b-a+1},(_,i)=>line.get(a+i));
}

export function wallEndpoints(w){
  const len=w.kind==='door'?2:1;
  return w.axis==='x'?[{x:w.gx,z:w.gz},{x:w.gx+len,z:w.gz}]:[{x:w.gx,z:w.gz},{x:w.gx,z:w.gz+len}];
}

export function wallJunctions(walls){
  const points=new Map();
  for(const w of walls)for(const p of wallEndpoints(w)){
    const key=p.x+','+p.z,entry=points.get(key)||{...p,axes:0};
    entry.axes|=w.axis==='x'?1:2;points.set(key,entry);
  }
  return [...points.values()].filter(p=>p.axes===3).map(({x,z})=>({x,z}));
}

// 靠近已有墙段端点时吸附到同一个整数格点，横竖墙可在转角处准确相交。
export function snapWallPoint(point,walls=[],radius=.72){
  let best=null,bestD=radius;
  for(const w of walls)for(const p of wallEndpoints(w)){
    const d=Math.hypot(point.fx-p.x,point.fz-p.z);
    if(d<bestD){bestD=d;best={...point,fx:p.x,fz:p.z};}
  }
  return best||point;
}

export function snappedWallCandidate(cursor,kind='wall',axis='x',walls=[]){
  if(!cursor)return null;
  const len=kind==='door'?2:1;
  const base={axis,gx:axis==='x'?Math.round(cursor.fx-len/2):Math.round(cursor.fx),gz:axis==='x'?Math.round(cursor.fz):Math.round(cursor.fz-len/2),kind};
  let best=null,bestScore=.86;
  for(const w of walls)for(const p of wallEndpoints(w)){
    if(Math.hypot(cursor.fx-p.x,cursor.fz-p.z)>.86)continue;
    for(const end of [0,1]){
      const candidate=axis==='x'?{axis,gx:p.x-(end?len:0),gz:p.z,kind}:{axis,gx:p.x,gz:p.z-(end?len:0),kind};
      const center={fx:candidate.gx+(axis==='x'?len/2:0),fz:candidate.gz+(axis==='z'?len/2:0)};
      const score=Math.min(Math.hypot(cursor.fx-center.fx,cursor.fz-center.fz),Math.hypot(cursor.fx-p.x,cursor.fz-p.z)+.08);
      if(score<bestScore){bestScore=score;best=candidate;}
    }
  }
  return best||base;
}

export function snapWallRun(run,walls=[],radius=.72){
  if(!run.length||!walls.length)return run;
  let best=null,bestD=radius;
  for(const a of run)for(const pa of wallEndpoints(a))for(const b of walls)for(const pb of wallEndpoints(b)){
    const d=Math.hypot(pa.x-pb.x,pa.z-pb.z);
    if(d<bestD){bestD=d;best={dx:pb.x-pa.x,dz:pb.z-pa.z};}
  }
  return best?run.map(w=>({...w,gx:w.gx+best.dx,gz:w.gz+best.dz})):run;
}

export function wallStroke(start,cursor,preferred='x',forced=null,walls=[]){
  const s=snapWallPoint(start,walls),dx=cursor.fx-s.fx,dz=cursor.fz-s.fz;
  const axis=forced||(Math.max(Math.abs(dx),Math.abs(dz))>.6?(Math.abs(dx)>=Math.abs(dz)?'x':'z'):preferred);
  const along=axis==='x'?'fx':'fz',across=axis==='x'?'fz':'fx',a=Math.round(s[along]-.5),b=Math.round(cursor[along]-.5),line=Math.round(s[across]);
  return Array.from({length:Math.min(241,Math.abs(b-a)+1)},(_,i)=>({axis,gx:axis==='x'?Math.min(a,b)+i:line,gz:axis==='x'?line:Math.min(a,b)+i,kind:'wall'}));
}

export function movedWallRun(walls,indices,start,cursor,turns=0,snapWalls=[]){
  if(!indices.length)return [];
  const first=walls[indices[0]],length=first.kind==='door'?2:indices.length,oldAxis=first.axis,axis=turns%2?(oldAxis==='x'?'z':'x'):oldAxis;
  const cx=first.gx+(oldAxis==='x'?length/2:0)+Math.round(cursor.fx-start.fx),cz=first.gz+(oldAxis==='z'?length/2:0)+Math.round(cursor.fz-start.fz);
  const gx=Math.round(cx-(axis==='x'?length/2:0)),gz=Math.round(cz-(axis==='z'?length/2:0));
  const run=indices.map((_,i)=>({axis,gx:gx+(axis==='x'?i:0),gz:gz+(axis==='z'?i:0),kind:first.kind}));
  return snapWallRun(run,snapWalls);
}
