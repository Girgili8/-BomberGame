(()=>{'use strict';
const COLS=17,ROWS=9,TILE=64,W=COLS*TILE,H=ROWS*TILE;
let scene,player,map=[],crates=[],bombs=[],flames=[],enemies=[],items=[],puddles=[];
let portal=null,portalHidden=true,fireSafeUntil=0,freezeUntil=0,levelStartTime=0;
let score=0,lives=3,level=1,maxBombs=1,power=2,speed=1,shieldCharges=0,fury=0;
let combo=1,comboUntil=0,paused=true,won=false,gameState='menu',lastStars=0;
const moving={up:false,down:false,left:false,right:false};
const dirs={up:{x:0,y:-1,row:3},down:{x:0,y:1,row:0},left:{x:-1,y:0,row:1},right:{x:1,y:0,row:2}};
const $=id=>document.getElementById(id);
const themes=[
 {name:'ЛЕСНАЯ АРЕНА',bg:'#17321f',grass:0xffffff,dirt:0xffffff,wall:0xffffff,crate:0xffffff,ambient:0xffe16a},
 {name:'СУМЕРЕЧНЫЙ САД',bg:'#2a2036',grass:0xb6c77a,dirt:0xc68a72,wall:0xc3b7d8,crate:0xe2aa72,ambient:0xc795ff},
 {name:'ЛЕДЯНАЯ РОЩА',bg:'#17313a',grass:0xb9e1cf,dirt:0xc6d7d6,wall:0xc2e2ff,crate:0xd7c7ae,ambient:0x8ee8ff}
];
function currentTheme(){return themes[(level-1)%themes.length]}
function hud(){
 $('score').textContent=score;$('lives').textContent=lives;$('cap').textContent=maxBombs;$('pow').textContent=power;$('level').textContent='1-'+level;
 const shieldEl=$('shield');if(shieldEl)shieldEl.textContent=shieldCharges;
 const furyFill=$('furyFill');if(furyFill)furyFill.style.width=Math.max(0,Math.min(100,fury))+'%';
 const furyLabel=$('furyLabel');if(furyLabel)furyLabel.textContent=fury>=100?'МЕГА-БОМБА ГОТОВА':'ЗАРЯД '+Math.floor(fury)+'%';
}
function setMission(text){const e=$('missionText');if(e)e.textContent=text}
function updateMission(){
 if(gameState!=='playing'&&gameState!=='loading')return;
 const alive=enemies.filter(e=>!e.dead).length;
 if(alive>0&&portalHidden)setMission(`Уничтожь врагов: ${alive} • Выход спрятан под ящиком`);
 else if(alive>0&&portal)setMission(`Уничтожь врагов: ${alive} • Портал пока запечатан`);
 else if(alive===0&&portalHidden)setMission('Враги побеждены! Взрывай ящики и найди портал');
 else if(alive===0&&portal)setMission('ПОРТАЛ ОТКРЫТ — войди в него');
}
function updateComboUi(){
 const e=$('comboText');if(!e)return;
 if(combo>1&&scene&&scene.time.now<comboUntil){e.textContent=`КОМБО x${combo}`;e.classList.add('show')}
 else{e.textContent='';e.classList.remove('show')}
}
function toast(t){const e=$('toast');e.textContent=t;e.style.opacity='1';clearTimeout(e.t);e.t=setTimeout(()=>e.style.opacity='0',1400)}
function award(base,furyGain=0){
 const now=scene?.time?.now||0;
 combo=now<=comboUntil?Math.min(8,combo+1):1;
 comboUntil=now+1450;
 score+=base*combo;
 addFury(furyGain);
 hud();updateComboUi();
}
function addFury(v){
 if(v<=0||fury>=100)return;
 fury=Math.min(100,fury+v);
 if(fury>=100){toast('⚡ МЕГА-БОМБА ГОТОВА!');navigator.vibrate?.([35,30,65])}
}
class GameScene extends Phaser.Scene{
 preload(){
  ['grass','dirt','wall','crate','bomb','fire','bombup','heart','speed'].forEach(k=>this.load.image(k,'assets/'+k+'.png'));
  this.load.spritesheet('hero','assets/hero_sheet.png',{frameWidth:64,frameHeight:72});
  ['slime','demon','bat'].forEach(k=>this.load.spritesheet(k,'assets/'+k+'_sheet.png',{frameWidth:64,frameHeight:64}));
  this.load.spritesheet('flame','assets/flame_sheet.png',{frameWidth:64,frameHeight:64});
 }
 create(){scene=this;createAnimations(this);buildLevel();this.cameras.main.setBackgroundColor(currentTheme().bg)}
 update(time,delta){updateGame(time,delta)}
}
function createAnimations(s){
 ['down','left','right','up'].forEach((name,row)=>s.anims.create({key:'hero-'+name,frames:s.anims.generateFrameNumbers('hero',{start:row*4,end:row*4+3}),frameRate:10,repeat:-1}));
 ['slime','demon','bat'].forEach(k=>s.anims.create({key:k+'-move',frames:s.anims.generateFrameNumbers(k,{start:0,end:3}),frameRate:k==='bat'?10:7,repeat:-1}));
 s.anims.create({key:'flame-burst',frames:s.anims.generateFrameNumbers('flame',{start:0,end:3}),frameRate:14,repeat:-1});
}
function clearWorld(){
 if(!scene)return;
 scene.children.removeAll(true);map=[];crates=[];bombs=[];flames=[];enemies=[];items=[];puddles=[];portal=null;portalHidden=true;fireSafeUntil=0;freezeUntil=0;
}
function tint(obj,value){if(value!==0xffffff)obj.setTint(value);return obj}
function createAmbient(theme){
 for(let i=0;i<18;i++){
  const x=Phaser.Math.Between(45,W-45),y=Phaser.Math.Between(45,H-45);
  const p=scene.add.circle(x,y,Phaser.Math.Between(1,3),theme.ambient,Phaser.Math.FloatBetween(.18,.55)).setDepth(1);
  scene.tweens.add({targets:p,x:x+Phaser.Math.Between(-18,18),y:y+Phaser.Math.Between(-15,15),alpha:Phaser.Math.FloatBetween(.08,.7),duration:Phaser.Math.Between(1400,3000),yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
 }
}
function buildLevel(){
 clearWorld();won=false;combo=1;comboUntil=0;levelStartTime=scene.time.now;
 const theme=currentTheme();scene.cameras.main.setBackgroundColor(theme.bg);
 const safeCells=[[1,1],[2,1],[1,2],[15,7],[14,7],[15,6],[15,1],[14,1],[1,7],[2,7],[13,5],[13,4],[11,1],[11,2],[5,7],[5,6]];
 for(let y=0;y<ROWS;y++){map[y]=[];for(let x=0;x<COLS;x++){
  let v=0;if(x===0||y===0||x===COLS-1||y===ROWS-1||(x%2===0&&y%2===0))v=1;else if(Math.random()<Math.min(.42,.32+level*.012))v=2;map[y][x]=v;
  const key=(x+y+level)%7===0?'dirt':'grass';
  const bg=tint(scene.add.image(x*TILE+32,y*TILE+32,key).setDepth(0),key==='grass'?theme.grass:theme.dirt);
  if((x*5+y*3+level)%17===0)scene.add.circle(x*TILE+18,y*TILE+18,2,0xffffff,.24).setDepth(1);
 }}
 safeCells.forEach(([x,y])=>map[y][x]=0);
 createAmbient(theme);
 for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
  if(map[y][x]===1)tint(scene.add.image(x*TILE+32,y*TILE+30,'wall').setDepth(4),theme.wall);
  if(map[y][x]===2){
   const c=tint(scene.add.image(x*TILE+32,y*TILE+32,'crate').setDepth(3),theme.crate);c.gridX=x;c.gridY=y;
   c.golden=Math.random()<.09;c.containsPortal=false;
   if(c.golden){c.setTint(0xffcf54);scene.tweens.add({targets:c,alpha:.75,duration:650,yoyo:true,repeat:-1,ease:'Sine.easeInOut'})}
   crates.push(c);
  }
 }
 if(crates.length){const exitCrate=Phaser.Utils.Array.GetRandom(crates);exitCrate.containsPortal=true}else spawnPortal(3,1);
 player=scene.add.sprite(96,100,'hero',0).setDepth(10);Object.assign(player,{gridX:1,gridY:1,busy:false,inv:0});player.stop();
 const spots=[[15,7,'demon'],[15,1,'bat'],[1,7,'slime'],[13,5,'demon'],[11,1,'bat'],[5,7,'slime']];
 const enemyCount=Math.min(2+level,6);
 for(let i=0;i<enemyCount;i++){
  const [x,y,type]=spots[i];map[y][x]=0;
  const e=scene.add.sprite(x*TILE+32,y*TILE+32,type).setDepth(9);
  Object.assign(e,{gridX:x,gridY:y,busy:false,dead:false,nextMove:0,nextBomb:1600+Math.random()*2200,bombCap:1,bombsPlaced:0,power:Math.min(4,2+Math.floor(level/3)),type,escapePath:[],pendingEscape:null,ownBomb:null,holdSafe:false,steps:0,frozenTint:false});
  e.play(type+'-move');enemies.push(e);
 }
 hud();updateMission();updateComboUi();toast(`${theme.name} 1-${level}`);
}
function inside(x,y){return x>=0&&y>=0&&x<COLS&&y<ROWS}
function bombAt(x,y){return bombs.find(b=>!b.dead&&b.gridX===x&&b.gridY===y)}
function puddleAt(x,y){return puddles.some(p=>!p.dead&&p.gridX===x&&p.gridY===y)}
function freeForActor(a,x,y,ignoreBomb=false){
 if(!inside(x,y))return false;
 if(map[y][x]===1)return false;
 if(map[y][x]===2&&a?.type!=='bat')return false;
 return ignoreBomb||!bombAt(x,y);
}
function free(x,y,ignoreBomb=false){return freeForActor(player,x,y,ignoreBomb)}
function leavePuddle(e){
 if(!e||e.type!=='slime'||puddleAt(e.gridX,e.gridY))return;
 const p=scene.add.ellipse(e.gridX*TILE+32,e.gridY*TILE+39,45,23,0x39d979,.42).setDepth(2);
 Object.assign(p,{gridX:e.gridX,gridY:e.gridY,dead:false,expires:scene.time.now+6200});puddles.push(p);
 scene.tweens.add({targets:p,alpha:.17,scaleX:1.16,scaleY:1.12,duration:900,yoyo:true,repeat:-1});
}
function moveActor(a,dir,duration){
 if(!a||a.busy)return false;const d=dirs[dir],nx=a.gridX+d.x,ny=a.gridY+d.y;if(!freeForActor(a,nx,ny))return false;
 if(a===player)a.play('hero-'+dir,true);a.busy=true;a.gridX=nx;a.gridY=ny;
 let moveDuration=duration||Math.max(70,115-speed*9);if(a===player&&puddleAt(nx,ny))moveDuration*=1.7;
 scene.tweens.add({targets:a,x:nx*TILE+32,y:ny*TILE+36,duration:moveDuration,ease:'Sine.easeInOut',onComplete:()=>{
  a.busy=false;
  if(a.type==='slime'){a.steps++;if(a.steps%3===0)leavePuddle(a)}
  if(a===player&&!moving[dir]){a.stop();a.setFrame(d.row*4)}
 }});return true;
}
function placeBomb(owner=player){
 if(paused||!owner||owner.dead)return false;const cap=owner===player?maxBombs:owner.bombCap;const used=owner===player?bombs.filter(b=>!b.dead&&b.owner===player).length:owner.bombsPlaced;if(used>=cap||bombAt(owner.gridX,owner.gridY))return false;
 const mega=owner===player&&fury>=100;if(mega)fury=0;
 const b=scene.add.image(owner.gridX*TILE+32,owner.gridY*TILE+32,'bomb').setDepth(7);if(mega)b.setTint(0x62e8ff).setScale(1.22);
 Object.assign(b,{gridX:owner.gridX,gridY:owner.gridY,dead:false,power:(owner===player?power:owner.power)+(mega?2:0),owner,mega});if(owner!==player)owner.bombsPlaced++;
 const fuse=mega?1050:(owner===player?1750:2750);b.fuseEnds=scene.time.now+fuse;
 if(owner!==player){owner.ownBomb=b;owner.holdSafe=true}
 b.countText=scene.add.text(b.x,b.y-30,'',{fontFamily:'Arial',fontSize:'18px',fontStyle:'bold',color:mega?'#7ff7ff':'#ffffff',stroke:'#000000',strokeThickness:4}).setOrigin(.5).setDepth(15);
 b.countEvent=scene.time.addEvent({delay:90,loop:true,callback:()=>{if(!b.dead&&b.countText)b.countText.setText(String(Math.max(1,Math.ceil((b.fuseEnds-scene.time.now)/1000))))}});
 b.timer=scene.time.delayedCall(fuse,()=>explode(b));bombs.push(b);scene.tweens.add({targets:b,scale:mega?1.42:1.14,yoyo:true,repeat:-1,duration:mega?120:210});if(owner===player)navigator.vibrate?.(20);hud();return true;
}
function destroyBombVisual(b){
 b.countEvent?.remove(false);b.countText?.destroy();b.countText=null;b.destroy();
}
function flameAt(x,y,mega=false){
 if(!inside(x,y))return;const f=scene.add.sprite(x*TILE+32,y*TILE+32,'flame').setDepth(12);Object.assign(f,{gridX:x,gridY:y,mega});f.play('flame-burst');if(mega)f.setTint(0x6fefff).setScale(1.12);flames.push(f);
 for(let i=0;i<(mega?5:3);i++){
  const p=scene.add.circle(f.x,f.y,Phaser.Math.Between(2,5),mega?0x7ff6ff:0xffc43d,.8).setDepth(13);
  scene.tweens.add({targets:p,x:p.x+Phaser.Math.Between(-28,28),y:p.y+Phaser.Math.Between(-28,28),alpha:0,scale:0,duration:Phaser.Math.Between(260,520),onComplete:()=>p.destroy()});
 }
 scene.tweens.add({targets:f,alpha:0,duration:mega?720:560,onComplete:()=>{f.destroy();flames=flames.filter(q=>q!==f);if(flames.length===0){fireSafeUntil=scene.time.now+220;enemies.forEach(e=>{if(!e.dead)e.holdSafe=false})}}});
}
function destroyCrateAt(x,y,mega=false){
 map[y][x]=0;const c=crates.find(q=>q.gridX===x&&q.gridY===y);if(!c)return;
 const wasExit=c.containsPortal,wasGolden=c.golden;
 award(wasGolden?35:10,wasGolden?18:8);
 scene.tweens.add({targets:c,alpha:0,scale:mega?2:1.6,angle:Phaser.Math.Between(-35,35),duration:190,onComplete:()=>c.destroy()});crates=crates.filter(q=>q!==c);
 if(wasExit)spawnPortal(x,y);else dropItem(x,y,wasGolden);
}
function explode(b){
 if(!b||b.dead)return;b.dead=true;if(b.owner&&b.owner!==player){b.owner.bombsPlaced=Math.max(0,b.owner.bombsPlaced-1);if(b.owner.ownBomb===b){b.owner.ownBomb=null;b.owner.holdSafe=true}}
 destroyBombVisual(b);flameAt(b.gridX,b.gridY,b.mega);scene.cameras.main.shake(b.mega?190:110,b.mega?.009:.005);if(b.mega)scene.cameras.main.flash(120,90,225,255,false);
 for(const name of ['up','down','left','right']){const d=dirs[name];for(let i=1;i<=b.power;i++){
  const x=b.gridX+d.x*i,y=b.gridY+d.y*i;if(!inside(x,y)||map[y][x]===1)break;flameAt(x,y,b.mega);const chain=bombAt(x,y);if(chain){chain.timer?.remove(false);explode(chain)}if(map[y][x]===2){destroyCrateAt(x,y,b.mega);break}
 }}
 hud();navigator.vibrate?.(b.mega?[40,25,80]:[25,25,45]);
}
function makeSpecialItem(x,y,kind){
 const colors={shield:0x44c8ff,freeze:0x9fe9ff,fury:0xffd23f};const icons={shield:'🛡️',freeze:'❄️',fury:'⚡'};
 const ring=scene.add.circle(0,0,22,colors[kind],.92).setStrokeStyle(3,0xffffff,.8);const txt=scene.add.text(0,0,icons[kind],{fontSize:'25px'}).setOrigin(.5);
 return scene.add.container(x*TILE+32,y*TILE+32,[ring,txt]).setDepth(6);
}
function dropItem(x,y,golden=false){
 let k=null;if(golden){k=Phaser.Utils.Array.GetRandom(['shield','freeze','fury','heart'])}else{
  const r=Math.random();if(r<.11)k='fire';else if(r<.20)k='bombup';else if(r<.28)k='speed';else if(r<.34)k='heart';else if(r<.40)k='shield';else if(r<.44)k='freeze';else if(r<.48)k='fury';
 }
 if(!k)return;const it=['shield','freeze','fury'].includes(k)?makeSpecialItem(x,y,k):scene.add.image(x*TILE+32,y*TILE+32,k).setDepth(6);Object.assign(it,{gridX:x,gridY:y,kind:k});items.push(it);scene.tweens.add({targets:it,y:it.y-6,yoyo:true,repeat:-1,duration:450});
}
function spawnPortal(x,y){
 if(portal)return;portalHidden=false;
 const outer=scene.add.circle(0,0,27,0x6d3cff,.34).setStrokeStyle(4,0xb898ff,.95);const inner=scene.add.circle(0,0,15,0x1b082f,.92);const core=scene.add.circle(0,0,6,0xffffff,.8);
 portal=scene.add.container(x*TILE+32,y*TILE+32,[outer,inner,core]).setDepth(5);Object.assign(portal,{gridX:x,gridY:y,active:false,outer,inner,core});
 scene.tweens.add({targets:outer,scale:1.25,alpha:.16,duration:700,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});scene.tweens.add({targets:core,angle:360,duration:1200,repeat:-1});
 toast('🌀 Найден портал!');if(enemies.length===0)activatePortal();else updateMission();
}
function activatePortal(){
 if(!portal||portal.active)return;portal.active=true;portal.outer.setFillStyle(0x2ce87f,.48).setStrokeStyle(4,0xa6ffd0,1);portal.inner.setFillStyle(0x06361d,.95);portal.core.setFillStyle(0xe9fff2,1);scene.tweens.add({targets:portal,scale:1.12,duration:420,yoyo:true,repeat:-1});toast('Портал открыт!');updateMission();
}
function collectItem(it){
 if(it.kind==='fire')power=Math.min(8,power+1);
 if(it.kind==='bombup')maxBombs=Math.min(6,maxBombs+1);
 if(it.kind==='heart')lives=Math.min(5,lives+1);
 if(it.kind==='speed')speed=Math.min(5,speed+1);
 if(it.kind==='shield')shieldCharges=Math.min(3,shieldCharges+1);
 if(it.kind==='freeze'){freezeUntil=scene.time.now+5000;toast('❄️ Враги заморожены на 5 секунд')}
 if(it.kind==='fury')addFury(45);
 score+=50;it.destroy();items=items.filter(q=>q!==it);if(it.kind!=='freeze')toast(it.kind==='shield'?'🛡️ Щит получен':it.kind==='fury'?'⚡ Заряд мега-бомбы':'Усиление получено');hud();
}
function damage(){
 if(player.inv>0)return;
 if(shieldCharges>0){shieldCharges--;player.inv=1200;player.setTint(0x65d9ff);scene.time.delayedCall(1200,()=>player?.clearTint());toast('🛡️ Щит поглотил взрыв');hud();navigator.vibrate?.([25,30,25]);return}
 lives--;player.inv=1600;player.setTint(0xff7777);scene.time.delayedCall(1600,()=>player?.clearTint());Object.assign(player,{gridX:1,gridY:1,busy:false});player.setPosition(96,100);hud();if(lives<=0)endGame(false);else toast('Осталось жизней: '+lives)
}
function endGame(victory){paused=true;gameState=victory?'victory':'defeat';scene.scene.pause();$('controls').classList.add('hidden');showEndScreen(victory)}
function dangerTiles(extraBomb=null){
 const set=new Set();flames.forEach(f=>set.add(f.gridX+','+f.gridY));const list=bombs.filter(b=>!b.dead).concat(extraBomb?[extraBomb]:[]);
 for(const b of list){set.add(b.gridX+','+b.gridY);for(const name of ['up','down','left','right']){const d=dirs[name];for(let i=1;i<=b.power;i++){const x=b.gridX+d.x*i,y=b.gridY+d.y*i;if(!inside(x,y)||map[y][x]===1)break;set.add(x+','+y);if(map[y][x]===2)break}}}
 return set;
}
function findSafePath(sx,sy,virtualBomb=null,actor=null){
 const danger=dangerTiles(virtualBomb),startKey=sx+','+sy;const q=[{x:sx,y:sy,path:[]}],seen=new Set([startKey]);
 while(q.length){const cur=q.shift(),key=cur.x+','+cur.y;if(cur.path.length>0&&!danger.has(key))return cur.path;if(cur.path.length>=7)continue;for(const [name,d] of Object.entries(dirs)){const nx=cur.x+d.x,ny=cur.y+d.y,k=nx+','+ny;if(seen.has(k)||!freeForActor(actor||player,nx,ny))continue;seen.add(k);q.push({x:nx,y:ny,path:cur.path.concat(name)})}}
 return null;
}
function moveOptions(e){return Object.entries(dirs).filter(([name,d])=>freeForActor(e,e.gridX+d.x,e.gridY+d.y))}
function safestMove(e){
 const danger=dangerTiles();const path=findSafePath(e.gridX,e.gridY,null,e);if(danger.has(e.gridX+','+e.gridY)&&path?.length)return path[0];
 let opts=moveOptions(e);if(!opts.length)return null;const safe=opts.filter(([name,d])=>!danger.has((e.gridX+d.x)+','+(e.gridY+d.y)));if(safe.length)opts=safe;
 if(e.type==='slime'&&Math.random()<.68)return Phaser.Utils.Array.GetRandom(opts)[0];
 opts.sort((a,b)=>{const da=Math.abs(e.gridX+a[1].x-player.gridX)+Math.abs(e.gridY+a[1].y-player.gridY),db=Math.abs(e.gridX+b[1].x-player.gridX)+Math.abs(e.gridY+b[1].y-player.gridY);const aggression=e.type==='demon'?1.8:e.type==='bat'?.7:.25;return (da-db)*aggression+(Math.random()-.5)*1.4});return opts[0][0];
}
function enemyCanBomb(e){
 if(e.type==='slime'||e.bombsPlaced>=e.bombCap||bombAt(e.gridX,e.gridY))return false;if(dangerTiles().has(e.gridX+','+e.gridY))return false;
 const nearPlayer=Math.abs(e.gridX-player.gridX)+Math.abs(e.gridY-player.gridY)<=3;const nearCrate=Object.values(dirs).some(d=>inside(e.gridX+d.x,e.gridY+d.y)&&map[e.gridY+d.y][e.gridX+d.x]===2);if(!nearPlayer&&!nearCrate)return false;
 const virtualBomb={gridX:e.gridX,gridY:e.gridY,power:e.power,dead:false};const path=findSafePath(e.gridX,e.gridY,virtualBomb,e);if(!path?.length||path.length>6)return false;e.pendingEscape=path;return true;
}
function killEnemy(e){
 if(e.dead)return;e.dead=true;award(e.type==='demon'?140:e.type==='bat'?120:100,28);scene.tweens.add({targets:e,alpha:0,scale:1.7,angle:e.type==='bat'?120:0,duration:220,onComplete:()=>e.destroy()});
}
function finishLevel(){
 if(won)return;won=true;const elapsed=(scene.time.now-levelStartTime)/1000;lastStars=lives>=3&&elapsed<85?3:lives>=2?2:1;score+=300*lastStars;hud();
 try{const best=Math.max(Number(localStorage.getItem('bomberBest')||0),score);localStorage.setItem('bomberBest',best);localStorage.setItem('bomberLevel',Math.max(Number(localStorage.getItem('bomberLevel')||1),level+1))}catch{}
 scene.time.delayedCall(420,()=>endGame(true));
}
function updateGame(time,delta){
 if(paused||!player)return;if(player.inv>0)player.inv-=delta;if(combo>1&&time>comboUntil){combo=1;updateComboUi()}
 if(!player.busy){for(const d of ['up','down','left','right'])if(moving[d]){moveActor(player,d);break}}
 puddles.slice().forEach(p=>{if(time>=p.expires){p.dead=true;p.destroy();puddles=puddles.filter(q=>q!==p)}});
 enemies.forEach(e=>{
  if(e.dead||e.busy)return;
  if(time<freezeUntil){if(!e.frozenTint){e.setTint(0x8de9ff);e.frozenTint=true}return}else if(e.frozenTint){e.clearTint();e.frozenTint=false}
  const moveDelay=e.type==='bat'?120:e.type==='slime'?185:160;
  if(flames.length>0||time<fireSafeUntil){e.nextMove=Math.max(e.nextMove,time+230);return}
  const danger=dangerTiles();
  if(e.escapePath?.length){if(time<e.nextMove)return;const dir=e.escapePath[0];e.nextMove=time+35;if(moveActor(e,dir,moveDelay))e.escapePath.shift();else e.escapePath=findSafePath(e.gridX,e.gridY,null,e)||[];return}
  if(danger.has(e.gridX+','+e.gridY)){const path=findSafePath(e.gridX,e.gridY,null,e);if(path?.length)e.escapePath=path;e.nextMove=time+25;return}
  if(e.holdSafe&&e.ownBomb&&!e.ownBomb.dead){e.nextMove=time+120;return}
  if(time>=e.nextBomb&&enemyCanBomb(e)){if(placeBomb(e))e.escapePath=e.pendingEscape||[];e.pendingEscape=null;e.nextBomb=time+(e.type==='demon'?3400:4800)+Math.random()*1800;e.nextMove=time+40;return}
  if(time<e.nextMove)return;e.nextMove=time+(e.type==='bat'?135:e.type==='slime'?230:175);const dir=safestMove(e);if(dir)moveActor(e,dir,moveDelay);
 });
 flames.forEach(f=>{if(f.gridX===player.gridX&&f.gridY===player.gridY)damage();enemies.forEach(e=>{if(!e.dead&&e.gridX===f.gridX&&e.gridY===f.gridY)killEnemy(e)})});
 enemies=enemies.filter(e=>!e.dead);
 items.slice().forEach(it=>{if(it.gridX===player.gridX&&it.gridY===player.gridY)collectItem(it)});
 if(enemies.length===0&&portal)activatePortal();updateMission();
 if(portal?.active&&player.gridX===portal.gridX&&player.gridY===portal.gridY)finishLevel();
}
const game=new Phaser.Game({type:Phaser.AUTO,parent:'game',width:W,height:H,backgroundColor:'#17321f',render:{antialias:true,pixelArt:false,roundPixels:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},scene:GameScene});
const joy=$('joystick'),stick=$('stick');let joyActive=false,pid=null;function clear(){Object.keys(moving).forEach(k=>moving[k]=false)}
function joyUpdate(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=42,len=Math.hypot(dx,dy);if(len>max){dx=dx/len*max;dy=dy/len*max}stick.style.transform=`translate(${dx}px,${dy}px)`;clear();if(len<12)return;const d=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');moving[d]=true;if(player&&!player.busy)moveActor(player,d)}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyActive=true;pid=e.pointerId;joy.setPointerCapture?.(pid);joyUpdate(e)},{passive:false});joy.addEventListener('pointermove',e=>{if(joyActive&&e.pointerId===pid){e.preventDefault();joyUpdate(e)}},{passive:false});function joyEnd(e){if(e.pointerId!==pid)return;joyActive=false;pid=null;clear();stick.style.transform='translate(0,0)';if(player)player.stop()}joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
$('bomb').addEventListener('pointerdown',e=>{e.preventDefault();if(gameState==='playing')placeBomb(player)},{passive:false});
const keyboardDirections={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
window.addEventListener('keydown',e=>{const dir=keyboardDirections[e.code];if(dir){e.preventDefault();if(gameState!=='playing')return;moving[dir]=true;if(player&&!player.busy)moveActor(player,dir);return}if(e.code==='Space'){e.preventDefault();if(gameState==='playing'&&!e.repeat)placeBomb(player)}},{passive:false});
window.addEventListener('keyup',e=>{const dir=keyboardDirections[e.code];if(!dir)return;e.preventDefault();moving[dir]=false;if(player&&!Object.values(moving).some(Boolean))player.stop()},{passive:false});window.addEventListener('blur',()=>clear());
$('pause').onclick=()=>{if(!scene||gameState!=='playing')return;paused=!paused;if(paused){scene.scene.pause();showPauseScreen()}else{scene.scene.resume();hideOverlay();toast('Продолжение')}};
const primary=$('primaryBtn'),secondary=$('secondaryBtn');
function setButtons(primaryText,primaryAction,secondaryText=null,secondaryAction=null){primary.textContent=primaryText;primary.onclick=primaryAction;secondary.style.display=secondaryText?'block':'none';if(secondaryText){secondary.textContent=secondaryText;secondary.onclick=secondaryAction}}
function showOverlay(title,text){$('ovTitle').textContent=title;$('ovText').innerHTML=text;$('loadingBadge').style.display='none';$('ovButtons').style.display='flex';$('overlay').style.display='flex'}
function hideOverlay(){$('overlay').style.display='none';$('loadingBadge').style.display='none';$('ovButtons').style.display='flex';$('controls').classList.remove('hidden')}
function newRun(){score=0;lives=3;level=1;maxBombs=1;power=2;speed=1;shieldCharges=0;fury=0;combo=1;startLevel(1)}
function showMainMenu(){gameState='menu';paused=true;clear();$('controls').classList.add('hidden');if(scene&&!scene.scene.isPaused())scene.scene.pause();let best=0;try{best=Number(localStorage.getItem('bomberBest')||0)}catch{}showOverlay('BOMBER V3.2',`Теперь у каждого врага своя механика:<br><b>слизь</b> оставляет лужи, <b>летучая мышь</b> летает через ящики, <b>демон</b> охотится с бомбами.<br><br>Найди скрытый портал и заряди мега-бомбу. Рекорд: <b>${best}</b>`);setButtons('НОВАЯ ИГРА',newRun,'КАК ИГРАТЬ',()=>showOverlay('КАК ИГРАТЬ','WASD или стрелки — движение. Пробел — бомба.<br>На телефоне используй джойстик и кнопку бомбы.<br><br>Синие щиты спасают от одного взрыва, снежинка замораживает врагов, молния заряжает мега-бомбу.'))}
function showLoading(nextLevel){gameState='loading';paused=true;$('controls').classList.add('hidden');$('ovTitle').textContent='УРОВЕНЬ '+nextLevel;$('ovText').textContent=currentTheme().name;$('loadingBadge').style.display='block';$('ovButtons').style.display='none';$('overlay').style.display='flex'}
let levelTransitionTimer=null;
function loadLevel(nextLevel,delay=700){if(!scene){toast('Игра загружается');return}window.clearTimeout(levelTransitionTimer);level=nextLevel;showLoading(level);levelTransitionTimer=window.setTimeout(()=>{levelTransitionTimer=null;clear();scene.time.removeAllEvents();scene.tweens.killAll();buildLevel();paused=false;gameState='playing';if(scene.scene.isPaused())scene.scene.resume();hideOverlay();toast('Уровень '+level)},delay)}
function startLevel(nextLevel){loadLevel(nextLevel)}
function restartLevel(){lives=3;shieldCharges=0;fury=Math.min(fury,50);loadLevel(level,450)}
function nextLevel(){lives=Math.min(3,lives+1);shieldCharges=Math.min(1,shieldCharges);loadLevel(level+1)}
function showEndScreen(victory){if(victory){showOverlay('ПОБЕДА!','Оценка: '+('⭐'.repeat(lastStars))+'<br>Арена очищена, портал найден.<br>Счёт: <b>'+score+'</b>');setButtons('СЛЕДУЮЩИЙ УРОВЕНЬ',nextLevel,'ГЛАВНОЕ МЕНЮ',showMainMenu)}else{showOverlay('ПОРАЖЕНИЕ','Все жизни потеряны.<br>Счёт: <b>'+score+'</b>');setButtons('ПОВТОРИТЬ',restartLevel,'ГЛАВНОЕ МЕНЮ',showMainMenu)}}
function showPauseScreen(){gameState='paused';$('controls').classList.add('hidden');showOverlay('ПАУЗА','Игра остановлена.');setButtons('ПРОДОЛЖИТЬ',()=>{gameState='playing';paused=false;scene.scene.resume();hideOverlay()},'ГЛАВНОЕ МЕНЮ',showMainMenu)}
window.__BOMBER_TEST__={state:()=>({score,lives,level,gameState,fury,shieldCharges,player:player?{x:player.gridX,y:player.gridY}:null,enemies:enemies.map(e=>({x:e.gridX,y:e.gridY,type:e.type,bombs:e.bombsPlaced})),crates:crates.length,bombs:bombs.filter(b=>!b.dead).length,flames:flames.length,portal:portal?{x:portal.gridX,y:portal.gridY,active:portal.active}:null,paused}),bomb:()=>placeBomb(player),move:d=>moveActor(player,d),start:()=>newRun()};
showMainMenu();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=3200').catch(console.warn);
})();
