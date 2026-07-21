(()=>{'use strict';
const COLS=17,ROWS=9,TILE=64,W=COLS*TILE,H=ROWS*TILE;
let scene,player,map=[],crates=[],bombs=[],flames=[],enemies=[],items=[],fireSafeUntil=0;
let score=0,lives=3,level=1,maxBombs=1,power=2,speed=1,paused=true,won=false,gameState='menu';
const moving={up:false,down:false,left:false,right:false};
const dirs={up:{x:0,y:-1,row:3},down:{x:0,y:1,row:0},left:{x:-1,y:0,row:1},right:{x:1,y:0,row:2}};
const $=id=>document.getElementById(id);
function hud(){ $('score').textContent=score;$('lives').textContent=lives;$('cap').textContent=maxBombs;$('pow').textContent=power;$('level').textContent='1-'+level; }
function toast(t){const e=$('toast');e.textContent=t;e.style.opacity='1';clearTimeout(e.t);e.t=setTimeout(()=>e.style.opacity='0',1300)}
class GameScene extends Phaser.Scene{
 preload(){
  ['grass','dirt','wall','crate','bomb','fire','bombup','heart','speed'].forEach(k=>this.load.image(k,'assets/'+k+'.png'));
  this.load.spritesheet('hero','assets/hero_sheet.png',{frameWidth:64,frameHeight:72});
  ['slime','demon','bat'].forEach(k=>this.load.spritesheet(k,'assets/'+k+'_sheet.png',{frameWidth:64,frameHeight:64}));
  this.load.spritesheet('flame','assets/flame_sheet.png',{frameWidth:64,frameHeight:64});
 }
 create(){scene=this;createAnimations(this);buildLevel();this.cameras.main.setBackgroundColor('#1a3021');}
 update(time,delta){updateGame(time,delta)}
}
function createAnimations(s){
 ['down','left','right','up'].forEach((name,row)=>s.anims.create({key:'hero-'+name,frames:s.anims.generateFrameNumbers('hero',{start:row*4,end:row*4+3}),frameRate:10,repeat:-1}));
 ['slime','demon','bat'].forEach(k=>s.anims.create({key:k+'-move',frames:s.anims.generateFrameNumbers(k,{start:0,end:3}),frameRate:k==='bat'?10:7,repeat:-1}));
 s.anims.create({key:'flame-burst',frames:s.anims.generateFrameNumbers('flame',{start:0,end:3}),frameRate:14,repeat:-1});
}
function clearWorld(){scene.children.removeAll(true);map=[];crates=[];bombs=[];flames=[];enemies=[];items=[];fireSafeUntil=0;}
function buildLevel(){
 clearWorld();won=false;
 for(let y=0;y<ROWS;y++){map[y]=[];for(let x=0;x<COLS;x++){
  let v=0;if(x===0||y===0||x===COLS-1||y===ROWS-1||(x%2===0&&y%2===0))v=1;else if(Math.random()<.34)v=2;map[y][x]=v;
  const bg=scene.add.image(x*TILE+32,y*TILE+32,(x+y)%7===0?'dirt':'grass').setDepth(0);
  if((x*5+y*3)%17===0){scene.add.circle(x*TILE+18,y*TILE+18,2,0xffffff,.28).setDepth(1)}
 }}
 [[1,1],[2,1],[1,2],[15,7],[14,7],[15,6],[15,1],[14,1],[1,7],[2,7],[13,5],[13,4]].forEach(([x,y])=>map[y][x]=0);
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  if(map[y][x]===1)scene.add.image(x*TILE+32,y*TILE+30,'wall').setDepth(4);
  if(map[y][x]===2){let c=scene.add.image(x*TILE+32,y*TILE+32,'crate').setDepth(3);c.gridX=x;c.gridY=y;crates.push(c)}
 }
 player=scene.add.sprite(96,100,'hero',0).setDepth(10);Object.assign(player,{gridX:1,gridY:1,busy:false,inv:0});player.stop();
 const spots=[[15,7,'demon'],[15,1,'bat'],[1,7,'slime'],[13,5,'demon']];
 for(let i=0;i<Math.min(2+level,4);i++){const [x,y,type]=spots[i];map[y][x]=0;let e=scene.add.sprite(x*TILE+32,y*TILE+32,type).setDepth(9);Object.assign(e,{gridX:x,gridY:y,busy:false,dead:false,nextMove:0,nextBomb:1800+Math.random()*1800,bombCap:1,bombsPlaced:0,power:2,type,escapePath:[],pendingEscape:null,ownBomb:null,holdSafe:false});e.play(type+'-move');enemies.push(e)}
 hud();toast('Лесная арена 1-'+level);
}
function inside(x,y){return x>=0&&y>=0&&x<COLS&&y<ROWS}
function bombAt(x,y){return bombs.find(b=>!b.dead&&b.gridX===x&&b.gridY===y)}
function free(x,y,ignoreBomb=false){if(!inside(x,y)||map[y][x]!==0)return false;return ignoreBomb||!bombAt(x,y)}
function moveActor(a,dir,duration){if(!a||a.busy)return false;const d=dirs[dir],nx=a.gridX+d.x,ny=a.gridY+d.y;if(!free(nx,ny))return false;if(a===player)a.play('hero-'+dir,true);a.busy=true;a.gridX=nx;a.gridY=ny;scene.tweens.add({targets:a,x:nx*TILE+32,y:ny*TILE+36,duration:duration||Math.max(70,115-speed*9),ease:'Sine.easeInOut',onComplete:()=>{a.busy=false;if(a===player&&!moving[dir]){a.stop();a.setFrame(d.row*4)}}});return true}
function placeBomb(owner=player){if(paused||!owner||owner.dead)return false;const cap=owner===player?maxBombs:owner.bombCap;const used=owner===player?bombs.filter(b=>!b.dead&&b.owner===player).length:owner.bombsPlaced;if(used>=cap||bombAt(owner.gridX,owner.gridY))return false;
 const b=scene.add.image(owner.gridX*TILE+32,owner.gridY*TILE+32,'bomb').setDepth(7);Object.assign(b,{gridX:owner.gridX,gridY:owner.gridY,dead:false,power:owner===player?power:owner.power,owner});if(owner!==player)owner.bombsPlaced++;
 const fuse=owner===player?1750:2750;
 if(owner!==player){owner.ownBomb=b;owner.holdSafe=true;}
 b.timer=scene.time.delayedCall(fuse,()=>explode(b));bombs.push(b);scene.tweens.add({targets:b,scale:1.14,yoyo:true,repeat:-1,duration:210});if(owner===player)navigator.vibrate?.(20);return true;
}
function flameAt(x,y){if(!inside(x,y))return;const f=scene.add.sprite(x*TILE+32,y*TILE+32,'flame').setDepth(12);Object.assign(f,{gridX:x,gridY:y});f.play('flame-burst');flames.push(f);scene.tweens.add({targets:f,alpha:0,duration:560,onComplete:()=>{f.destroy();flames=flames.filter(q=>q!==f);if(flames.length===0){fireSafeUntil=scene.time.now+220;enemies.forEach(e=>{if(!e.dead)e.holdSafe=false})}}})}
function explode(b){if(!b||b.dead)return;b.dead=true;if(b.owner&&b.owner!==player){b.owner.bombsPlaced=Math.max(0,b.owner.bombsPlaced-1);if(b.owner.ownBomb===b){b.owner.ownBomb=null;b.owner.holdSafe=true;}}b.destroy();flameAt(b.gridX,b.gridY);scene.cameras.main.shake(110,.005);
 for(const name of ['up','down','left','right']){const d=dirs[name];for(let i=1;i<=b.power;i++){const x=b.gridX+d.x*i,y=b.gridY+d.y*i;if(!inside(x,y)||map[y][x]===1)break;flameAt(x,y);const chain=bombAt(x,y);if(chain){chain.timer.remove(false);explode(chain)}if(map[y][x]===2){map[y][x]=0;score+=10;const c=crates.find(q=>q.gridX===x&&q.gridY===y);if(c){scene.tweens.add({targets:c,alpha:0,scale:1.6,angle:25,duration:190,onComplete:()=>c.destroy()});crates=crates.filter(q=>q!==c)}dropItem(x,y);break}}}
 hud();navigator.vibrate?.([25,25,45]);
}
function dropItem(x,y){const r=Math.random();let k=null;if(r<.10)k='fire';else if(r<.18)k='bombup';else if(r<.23)k='speed';else if(r<.27)k='heart';if(!k)return;const it=scene.add.image(x*TILE+32,y*TILE+32,k).setDepth(6);Object.assign(it,{gridX:x,gridY:y,kind:k});items.push(it);scene.tweens.add({targets:it,y:it.y-5,yoyo:true,repeat:-1,duration:450})}
function damage(){if(player.inv>0)return;lives--;player.inv=1600;player.setTint(0xff7777);scene.time.delayedCall(1600,()=>player?.clearTint());Object.assign(player,{gridX:1,gridY:1,busy:false});player.setPosition(96,100);hud();if(lives<=0)endGame(false);else toast('Осталось жизней: '+lives)}
function endGame(victory){paused=true;gameState=victory?'victory':'defeat';scene.scene.pause();$('controls').classList.add('hidden');showEndScreen(victory)}
function dangerTiles(extraBomb=null){
 const set=new Set();
 flames.forEach(f=>set.add(f.gridX+','+f.gridY));
 const list=bombs.filter(b=>!b.dead).concat(extraBomb?[extraBomb]:[]);
 for(const b of list){
  set.add(b.gridX+','+b.gridY);
  for(const name of ['up','down','left','right']){
   const d=dirs[name];
   for(let i=1;i<=b.power;i++){
    const x=b.gridX+d.x*i,y=b.gridY+d.y*i;
    if(!inside(x,y)||map[y][x]===1)break;
    set.add(x+','+y);
    if(map[y][x]===2)break;
   }
  }
 }
 return set;
}
function findSafePath(sx,sy,virtualBomb=null){
 const danger=dangerTiles(virtualBomb),startKey=sx+','+sy;
 const q=[{x:sx,y:sy,path:[]}],seen=new Set([startKey]);
 while(q.length){
  const cur=q.shift(),key=cur.x+','+cur.y;
  if(cur.path.length>0&&!danger.has(key))return cur.path;
  if(cur.path.length>=7)continue;
  for(const [name,d] of Object.entries(dirs)){
   const nx=cur.x+d.x,ny=cur.y+d.y,k=nx+','+ny;
   if(seen.has(k)||!inside(nx,ny)||map[ny][nx]!==0)continue;
   const blockingBomb=bombAt(nx,ny);
   if(blockingBomb)continue;
   seen.add(k);q.push({x:nx,y:ny,path:cur.path.concat(name)});
  }
 }
 return null;
}
function safestMove(e){
 const danger=dangerTiles();
 const path=findSafePath(e.gridX,e.gridY);
 if(danger.has(e.gridX+','+e.gridY)&&path&&path.length)return path[0];
 let opts=Object.entries(dirs).filter(([name,d])=>free(e.gridX+d.x,e.gridY+d.y));
 if(!opts.length)return null;
 const safe=opts.filter(([name,d])=>!danger.has((e.gridX+d.x)+','+(e.gridY+d.y)));
 if(safe.length)opts=safe;
 opts.sort((a,b)=>{
  const da=Math.abs(e.gridX+a[1].x-player.gridX)+Math.abs(e.gridY+a[1].y-player.gridY);
  const db=Math.abs(e.gridX+b[1].x-player.gridX)+Math.abs(e.gridY+b[1].y-player.gridY);
  return (da-db)+(Math.random()-.5)*1.1;
 });
 return opts[0][0];
}
function enemyCanBomb(e){
 if(e.bombsPlaced>=e.bombCap||bombAt(e.gridX,e.gridY))return false;
 if(dangerTiles().has(e.gridX+','+e.gridY))return false;
 const nearPlayer=Math.abs(e.gridX-player.gridX)+Math.abs(e.gridY-player.gridY)<=3;
 const nearCrate=Object.values(dirs).some(d=>inside(e.gridX+d.x,e.gridY+d.y)&&map[e.gridY+d.y][e.gridX+d.x]===2);
 if(!nearPlayer&&!nearCrate)return false;
 const virtualBomb={gridX:e.gridX,gridY:e.gridY,power:e.power,dead:false};
 const path=findSafePath(e.gridX,e.gridY,virtualBomb);
 if(!path||!path.length||path.length>6)return false;
 e.pendingEscape=path;
 return true;
}
function updateGame(time,delta){if(paused||!player)return;if(player.inv>0)player.inv-=delta;if(!player.busy){for(const d of ['up','down','left','right'])if(moving[d]){moveActor(player,d);break}}
 enemies.forEach(e=>{
  if(e.dead||e.busy)return;
  const moveDelay=e.type==='bat'?135:175;
  // Пока существует хотя бы одна клетка огня, враги полностью ждут.
  // После исчезновения последнего пламени действует короткая защитная пауза.
  if(flames.length>0||time<fireSafeUntil){e.nextMove=Math.max(e.nextMove,time+230);return;}
  const danger=dangerTiles();
  if(e.escapePath&&e.escapePath.length){
   if(time<e.nextMove)return;
   const dir=e.escapePath[0];
   e.nextMove=time+35;
   if(moveActor(e,dir,moveDelay))e.escapePath.shift();
   else {
    const fresh=findSafePath(e.gridX,e.gridY);
    e.escapePath=fresh||[];
   }
   return;
  }
  if(danger.has(e.gridX+','+e.gridY)){
   const path=findSafePath(e.gridX,e.gridY);
   if(path&&path.length)e.escapePath=path;
   e.nextMove=time+25;
   return;
  }
  // После своей бомбы враг остаётся на найденной безопасной клетке
  // и не возвращается в линию взрыва до детонации.
  if(e.holdSafe&&e.ownBomb&&!e.ownBomb.dead){
   e.nextMove=time+120;
   return;
  }
  if(time>=e.nextBomb&&enemyCanBomb(e)){
   if(placeBomb(e))e.escapePath=e.pendingEscape||[];
   e.pendingEscape=null;
   e.nextBomb=time+4200+Math.random()*2200;
   e.nextMove=time+40;
   return;
  }
  if(time<e.nextMove)return;
  e.nextMove=time+(e.type==='bat'?150:200);
  const dir=safestMove(e);
  if(dir)moveActor(e,dir,moveDelay);
 });
 flames.forEach(f=>{if(f.gridX===player.gridX&&f.gridY===player.gridY)damage();enemies.forEach(e=>{if(!e.dead&&e.gridX===f.gridX&&e.gridY===f.gridY){e.dead=true;score+=100;scene.tweens.add({targets:e,alpha:0,scale:1.6,duration:180,onComplete:()=>e.destroy()})}})});enemies=enemies.filter(e=>!e.dead);
 // Контакт с врагом безопасен: урон наносят только клетки пламени.
 items.slice().forEach(it=>{if(it.gridX===player.gridX&&it.gridY===player.gridY){if(it.kind==='fire')power=Math.min(7,power+1);if(it.kind==='bombup')maxBombs=Math.min(5,maxBombs+1);if(it.kind==='heart')lives++;if(it.kind==='speed')speed=Math.min(4,speed+1);score+=50;it.destroy();items=items.filter(q=>q!==it);toast('Усиление получено');hud()}});
 if(!won&&enemies.length===0){won=true;score+=300;hud();scene.time.delayedCall(500,()=>endGame(true))}
}
const game=new Phaser.Game({type:Phaser.AUTO,parent:'game',width:W,height:H,backgroundColor:'#17321f',render:{antialias:true,pixelArt:false,roundPixels:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},scene:GameScene});
const joy=$('joystick'),stick=$('stick');let joyActive=false,pid=null;function clear(){Object.keys(moving).forEach(k=>moving[k]=false)}
function joyUpdate(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=42,len=Math.hypot(dx,dy);if(len>max){dx=dx/len*max;dy=dy/len*max}stick.style.transform=`translate(${dx}px,${dy}px)`;clear();if(len<12)return;const d=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');moving[d]=true;if(player&&!player.busy)moveActor(player,d)}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyActive=true;pid=e.pointerId;joy.setPointerCapture?.(pid);joyUpdate(e)},{passive:false});joy.addEventListener('pointermove',e=>{if(joyActive&&e.pointerId===pid){e.preventDefault();joyUpdate(e)}},{passive:false});function joyEnd(e){if(e.pointerId!==pid)return;joyActive=false;pid=null;clear();stick.style.transform='translate(0,0)';if(player)player.stop()}joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
$('bomb').addEventListener('pointerdown',e=>{e.preventDefault();if(gameState==='playing')placeBomb(player)},{passive:false});
$('pause').onclick=()=>{if(!scene||gameState!=='playing')return;paused=!paused;if(paused){scene.scene.pause();showPauseScreen()}else{scene.scene.resume();hideOverlay();toast('Продолжение')}};
const primary=$('primaryBtn'),secondary=$('secondaryBtn');
function setButtons(primaryText,primaryAction,secondaryText=null,secondaryAction=null){primary.textContent=primaryText;primary.onclick=primaryAction;secondary.style.display=secondaryText?'block':'none';if(secondaryText){secondary.textContent=secondaryText;secondary.onclick=secondaryAction}}
function showOverlay(title,text){$('ovTitle').textContent=title;$('ovText').textContent=text;$('loadingBadge').style.display='none';$('ovButtons').style.display='flex';$('overlay').style.display='flex'}
function hideOverlay(){$('overlay').style.display='none';$('loadingBadge').style.display='none';$('ovButtons').style.display='flex';$('controls').classList.remove('hidden')}
function showMainMenu(){gameState='menu';paused=true;clear();$('controls').classList.add('hidden');if(scene&&!scene.scene.isPaused())scene.scene.pause();showOverlay('BOMBER V3','Уничтожь всех врагов с помощью бомб. Касание соперника безопасно — опасно только пламя.');setButtons('ИГРАТЬ',()=>startLevel(1),'НАСТРОЙКИ',()=>toast('Настройки звука будут в следующем обновлении'))}
function showLoading(nextLevel){gameState='loading';paused=true;$('controls').classList.add('hidden');$('ovTitle').textContent='УРОВЕНЬ '+nextLevel;$('ovText').textContent='Приготовься!';$('loadingBadge').style.display='block';$('ovButtons').style.display='none';$('overlay').style.display='flex'}
function startLevel(nextLevel){if(!scene){toast('Игра загружается');return}level=nextLevel;showLoading(level);scene.time.delayedCall(700,()=>{if(scene.scene.isPaused())scene.scene.resume();buildLevel();paused=false;gameState='playing';hideOverlay();toast('Уровень '+level)})}
function restartLevel(){showLoading(level);if(scene.scene.isPaused())scene.scene.resume();scene.time.removeAllEvents();scene.tweens.killAll();buildLevel();paused=false;gameState='playing';hideOverlay();}
function nextLevel(){level++;lives=Math.min(3,lives+1);showLoading(level);scene.time.delayedCall(700,()=>{if(scene.scene.isPaused())scene.scene.resume();buildLevel();paused=false;gameState='playing';hideOverlay();toast('Уровень '+level)})}
function showEndScreen(victory){if(victory){showOverlay('ПОБЕДА!','Арена очищена. Счёт: '+score);setButtons('СЛЕДУЮЩИЙ УРОВЕНЬ',nextLevel,'ГЛАВНОЕ МЕНЮ',showMainMenu)}else{showOverlay('ПОРАЖЕНИЕ','Все жизни потеряны. Счёт: '+score);setButtons('ПОВТОРИТЬ',restartLevel,'ГЛАВНОЕ МЕНЮ',showMainMenu)}}
function showPauseScreen(){gameState='paused';$('controls').classList.add('hidden');showOverlay('ПАУЗА','Игра остановлена.');setButtons('ПРОДОЛЖИТЬ',()=>{gameState='playing';paused=false;scene.scene.resume();hideOverlay()},'ГЛАВНОЕ МЕНЮ',showMainMenu)}
window.__BOMBER_TEST__={state:()=>({score,lives,level,gameState,player:player?{x:player.gridX,y:player.gridY}:null,enemies:enemies.map(e=>({x:e.gridX,y:e.gridY,type:e.type,bombs:e.bombsPlaced})),crates:crates.length,bombs:bombs.filter(b=>!b.dead).length,flames:flames.length,paused}),bomb:()=>placeBomb(player),move:d=>moveActor(player,d),start:()=>startLevel(1)};
showMainMenu();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=3011').catch(console.warn);
})();
