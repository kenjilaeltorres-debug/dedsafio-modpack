'use strict';
function setupAppUpdate({ updater, app, channel, emit, blocked, prepareQuit }) {
 let state={status:'unconfigured',version:app.getVersion()}, checking=false, installing=false;
 const send=(status,extra={})=>{state={...state,...extra,status};emit({type:'app-update',...state});};
 updater.autoDownload=false;updater.autoInstallOnAppQuit=false;
 updater.on('checking-for-update',()=>send('checking'));
 updater.on('update-not-available',()=>send('current'));
 updater.on('update-available',info=>{send('available',{nextVersion:info.version});if(!blocked())void download().catch(()=>{});});
 updater.on('download-progress',p=>send('downloading',{percent:Math.floor(p.percent)}));
 updater.on('update-downloaded',info=>send('ready',{nextVersion:info.version}));
 updater.on('error',error=>send('error',{message:String(error.message||error).slice(0,250)}));
 if(channel){const u=new URL(channel);if(u.protocol!=='https:'||u.username||u.password)throw new Error('El canal del launcher debe usar HTTPS.');updater.setFeedURL({provider:'generic',url:u.href});send('idle');}
 async function check(){if(!channel){send('unconfigured');return state;}if(checking||['downloading','ready'].includes(state.status))return state;if(blocked())throw new Error('Cierra Minecraft y espera a que termine la operación actual.');checking=true;try{await updater.checkForUpdates();return state;}finally{checking=false;}}
 async function download(){if(blocked())throw new Error('Cierra Minecraft antes de descargar la actualización.');if(state.status!=='available')return state;send('downloading',{percent:0});try{await updater.downloadUpdate();return state;}catch(e){send('error',{message:e.message});throw e;}}
 function install(){if(blocked())throw new Error('Cierra Minecraft antes de actualizar el launcher.');if(state.status!=='ready'||installing)throw new Error('La actualización todavía no está lista.');installing=true;prepareQuit();updater.quitAndInstall(false,true);}
 return {check,download,install,state:()=>state};
}
module.exports={setupAppUpdate};
