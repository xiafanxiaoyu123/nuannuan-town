import { animalSegmentClear } from './animal-walk-path.js';

const GAP = .25, BUCKET = 2, MARGIN = .28;
const DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const point = p => ({ x:p.x, z:p.z });
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

export function nextAnimalReturnPoint(points,animal,clear) {
  // Shortcuts are accepted only against the current complete segment.
  for(let i=Math.min(points.length-1,6);i>0;i--)if(clear(animal,points[i])){points.splice(0,i);break;}
  const first=points[0];if(!first)return null;
  if(points.length>1&&distance(animal,first)<.05&&!clear(animal,points[1])){
    const next=points[1];
    if(distance(animal,next)<=.8)for(const bend of [{x:next.x,z:animal.z},{x:animal.x,z:next.z}])if(distance(animal,bend)>.04&&clear(animal,bend)&&clear(bend,next)){points.shift();points.unshift(bend);return bend;}
    // The original gait settles .035m before a target. At a tight corner that
    // may be too early to turn. A tiny, fully clear extension guides the same
    // gait into the open corner without changing its speed or collision radius.
    const d=distance(animal,first);
    if(d>.0001)for(const extra of [.06,.04,.03,.02,.015,.01,.005]){
      const ahead={x:first.x+(first.x-animal.x)/d*extra,z:first.z+(first.z-animal.z)/d*extra};
      if(distance(animal,ahead)>.035&&clear(animal,ahead)&&clear(ahead,next))return ahead;
    }
  }
  return clear(animal,first)?first:null;
}

function push(heap, entry) {
  let i=heap.length;heap.push(entry);
  while(i){const parent=(i-1)>>1;if(heap[parent].f<=entry.f)break;heap[i]=heap[parent];i=parent;}heap[i]=entry;
}
function pop(heap) {
  const first=heap[0],last=heap.pop();if(!heap.length)return first;
  let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].f<heap[child].f)child++;if(heap[child].f>=last.f)break;heap[i]=heap[child];i=child;}heap[i]=last;return first;
}

// One runtime cache per actual home layout. No saved routes, clocks or rewards.
// Search work is shared across the entire herd, rather than budgeted per animal.
export function createAnimalReturnNavigator({bounds,rects=[],circles=[]}) {
  function axis(low,high,boundaries){
    const values=[];for(let p=low+GAP/2;p<high;p+=GAP)values.push(p);
    const edges=[...new Set(boundaries.filter(p=>p>low&&p<high))].sort((a,b)=>a-b);let extra=0;
    // Preserve thin, genuinely open passages between expanded rectangle edges.
    // Bounded extra coordinates avoid a uniform ultra-fine grid over the island.
    for(let i=1;i<edges.length&&extra<64;i++)if(edges[i]-edges[i-1]>.0001&&edges[i]-edges[i-1]<GAP){values.push((edges[i]+edges[i-1])/2);extra++;}
    return [...new Set(values)].sort((a,b)=>a-b);
  }
  const xs=axis(bounds.x0,bounds.x1,rects.flatMap(r=>[r.x0-MARGIN,r.x1+MARGIN])),zs=axis(bounds.z0,bounds.z1,rects.flatMap(r=>[r.z0-MARGIN,r.z1+MARGIN]));
  const cols=xs.length,rows=zs.length,count=cols*rows;
  const stand=new Uint8Array(count),edges=new Uint8Array(count*8),buckets=new Map(),jobs=new Map();
  const stats={expanded:0,checks:0,requests:0,lastWork:0};let cursor=0;
  const bucketKey=(x,z)=>`${x},${z}`;
  function put(shape,type,box){
    const bx0=Math.floor(Math.max(bounds.x0,box.x0)/BUCKET),bx1=Math.floor(Math.min(bounds.x1,box.x1)/BUCKET),bz0=Math.floor(Math.max(bounds.z0,box.z0)/BUCKET),bz1=Math.floor(Math.min(bounds.z1,box.z1)/BUCKET);
    for(let x=bx0;x<=bx1;x++)for(let z=bz0;z<=bz1;z++){const key=bucketKey(x,z);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({shape,type});}
  }
  for(const r of rects)put({...r},'rect',{x0:r.x0-MARGIN,x1:r.x1+MARGIN,z0:r.z0-MARGIN,z1:r.z1+MARGIN});
  for(const c of circles)put({...c},'circle',{x0:c.x-c.r-MARGIN,x1:c.x+c.r+MARGIN,z0:c.z-c.r-MARGIN,z1:c.z+c.r+MARGIN});
  const inside=p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>bounds.x0&&p.x<bounds.x1&&p.z>bounds.z0&&p.z<bounds.z1;
  function clear(from,to){
    if(!inside(from)||!inside(to))return false;
    const found=new Set(),rs=[],cs=[];
    for(let x=Math.floor(Math.min(from.x,to.x)/BUCKET);x<=Math.floor(Math.max(from.x,to.x)/BUCKET);x++)for(let z=Math.floor(Math.min(from.z,to.z)/BUCKET);z<=Math.floor(Math.max(from.z,to.z)/BUCKET);z++)for(const item of buckets.get(bucketKey(x,z))||[])if(!found.has(item.shape)){found.add(item.shape);(item.type==='rect'?rs:cs).push(item.shape);}
    stats.checks++;return animalSegmentClear(from,to,rs,cs,MARGIN);
  }
  const position=n=>({x:xs[n%cols],z:zs[Math.floor(n/cols)]});
  function free(n){if(!stand[n]){const p=position(n);stand[n]=clear(p,p)?1:2;}return stand[n]===1;}
  function edge(n,next,dir){const key=n*8+dir;if(!edges[key]){const value=free(next)&&clear(position(n),position(next))?1:2;edges[key]=value;edges[next*8+(dir+4)%8]=value;}return edges[key]===1;}
  function connections(p){
    const nearest=(values,value)=>{let low=0,high=values.length-1;while(low<high){const mid=(low+high)>>1;if(values[mid]<value)low=mid+1;else high=mid;}return low>0&&value-values[low-1]<values[low]-value?low-1:low;};
    const cx=nearest(xs,p.x),cz=nearest(zs,p.z),out=[];
    for(let z=Math.max(0,cz-4);z<=Math.min(rows-1,cz+4);z++)for(let x=Math.max(0,cx-4);x<=Math.min(cols-1,cx+4);x++){const n=z*cols+x;out.push({n,cost:distance(p,position(n))});}
    return out.sort((a,b)=>a.cost-b.cost);
  }
  function request(key,start,goal){
    stats.requests++;const job={key,start:point(start),goal:point(goal),state:'searching',points:null,expanded:0,work:0};jobs.set(key,job);
    if(!clear(start,start)||!clear(goal,goal)){job.state='blocked';return view(key);}
    if(clear(start,goal)){job.state='returning';job.points=[point(goal)];return view(key);}
    for(const bend of [{x:start.x,z:goal.z},{x:goal.x,z:start.z}])if(clear(start,bend)&&clear(bend,goal)){job.state='returning';job.points=[bend,point(goal)];return view(key);}
    job.connect=[{at:point(start),candidates:connections(start),valid:[],index:0},{at:point(goal),candidates:connections(goal),valid:[],index:0}];job.stage=0;
    return view(key);
  }
  function advance(job,limit){
    let used=0;
    while(job.connect&&used<limit){
      const group=job.connect[job.stage];
      if(group.index>=group.candidates.length||group.valid.length>=8){
        if(!group.valid.length){job.state='blocked';delete job.connect;return used;}
        if(job.stage++===0)continue;
        job.g=new Float64Array(count);job.g.fill(Infinity);job.parent=new Int32Array(count);job.parent.fill(-1);job.closed=new Uint8Array(count);job.heap=[];job.ends=new Set(job.connect[1].valid.map(e=>e.n));
        for(const entry of job.connect[0].valid){job.g[entry.n]=entry.cost;push(job.heap,{n:entry.n,g:entry.cost,f:entry.cost+distance(position(entry.n),job.goal)});}
        delete job.connect;break;
      }
      const entry=group.candidates[group.index++];used++;job.work++;if(free(entry.n)&&clear(group.at,position(entry.n)))group.valid.push(entry);
    }
    if(job.connect)return used;
    while(job.heap.length&&used<limit){
      const current=pop(job.heap);used++;job.work++;
      const n=current.n;if(job.closed[n]||current.g!==job.g[n])continue;
      job.closed[n]=1;job.expanded++;stats.expanded++;
      if(job.ends.has(n)){
        const route=[];for(let at=n;at>=0;at=job.parent[at])route.push(position(at));route.reverse();route.push(point(job.goal));
        job.points=route;job.state='returning';job.heap=[];delete job.g;delete job.parent;delete job.closed;delete job.ends;return used;
      }
      const x=n%cols,z=Math.floor(n/cols);
      for(let dir=0;dir<8;dir++){const [dx,dz]=DIRS[dir],nx=x+dx,nz=z+dz;if(nx<0||nx>=cols||nz<0||nz>=rows)continue;const next=nz*cols+nx;if(job.closed[next]||!edge(n,next,dir))continue;const g=current.g+distance(position(n),position(next));if(g>=job.g[next])continue;job.g[next]=g;job.parent[next]=n;push(job.heap,{n:next,g,f:g+distance(position(next),job.goal)});}
    }
    if(!job.heap.length)job.state='blocked';return used;
  }
  function tick(budget=256){
    let remaining=Math.max(0,Math.min(256,Math.floor(budget))),spent=0;
    let active=[...jobs.values()].filter(job=>job.state==='searching');
    while(remaining&&active.length){cursor%=active.length;const job=active[cursor],used=advance(job,Math.min(64,remaining));remaining-=used;spent+=used;if(job.state!=='searching')active.splice(cursor,1);else cursor++;if(!used&&job.state==='searching')break;}
    stats.lastWork=spent;return spent;
  }
  function view(key){const job=jobs.get(key);return job?{state:job.state,points:job.points,expanded:job.expanded,work:job.work}:null;}
  return {request,tick,view,clear,cancel:key=>jobs.delete(key),dispose(){jobs.clear();buckets.clear();},stats:()=>({...stats,nodes:count,jobs:jobs.size,searching:[...jobs.values()].filter(j=>j.state==='searching').length})};
}
