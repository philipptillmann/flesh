import {authSecret, randomSalt, vaultKey, encrypt, decrypt} from './crypto.js';
const root = document.querySelector('#app');
let key, data, revision, page='today', busy=false, lastActivity=Date.now(), timer, authMode='login', generation=0;
const localDate = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => new Date(value.length===10?value+'T12:00:00':value).toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'});
const labelDate = () => `<label>Datum<input name="date" type="date" value="${localDate()}" required></label>`;
const note = () => '<label>Notizen<textarea name="note" maxlength="2000" placeholder="Was möchtest du festhalten?"></textarea></label>';
const empty = text => `<p class="empty">${text}</p>`;
function toast(message) { const el=document.querySelector('#status'); el.textContent=message; clearTimeout(timer); timer=setTimeout(()=>el.textContent='',6500); }
async function api(path, body) {
  const res=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const value=await res.json();
  if(!res.ok) throw new Error(value.error || 'Anfrage fehlgeschlagen.');
  return value;
}
function authScreen() {
  root.innerHTML=`<main class="auth"><div class="brand"><img class="logo" src="/icon-192.png" alt="" width="42" height="42"> Flesh</div><div class="auth-grid"><section><p class="eyebrow">DEIN KÖRPER. DEIN ÜBERBLICK.</p><h1>Ein guter Ort,<br>um auf dich<br>zu achten.</h1><p class="intro">Beschwerden verstehen. Medikamente im Blick behalten. Deinen Rhythmus kennenlernen.</p><div class="privacy">◇ &nbsp; Im Browser verschlüsselt.<br><span>Auf deinem Server sicher abgelegt.</span></div></section><section class="card login"><p class="eyebrow">DEIN PERSÖNLICHER BEREICH</p><h2>${authMode==='login'?'Willkommen zurück.':'Dein Journal beginnt hier.'}</h2><p>${authMode==='login'?'Melde dich an und entschlüssle dein Journal.':'Lege einen Account mit einem starken Passwort an.'}</p><form id="auth"><label>Benutzername<input name="username" required minlength="3" maxlength="64" pattern="[a-zA-Z0-9_.-]+" autocomplete="username" autocapitalize="none" placeholder="z. B. mein.journal"></label><label>Passwort<input name="password" type="password" minlength="12" maxlength="256" required autocomplete="${authMode==='login'?'current-password':'new-password'}"></label>${authMode==='register'?'<label>Passwort wiederholen<input name="confirm" type="password" required autocomplete="new-password"></label><p class="hint">Mindestens 12 Zeichen. Bewahre das Passwort gut auf: Ohne dieses können deine Daten nicht wiederhergestellt werden.</p>':''}<button class="primary" type="submit">${authMode==='login'?'Journal entsperren →':'Account erstellen →'}</button><p id="auth-error" role="alert"></p></form><button class="link" id="auth-toggle">${authMode==='login'?'Noch kein Account? Jetzt anlegen':'Schon dabei? Anmelden'}</button></section></div><p class="footnote">Flesh · Ein privater Raum für deine Gesundheit</p></main>`;
  document.querySelector('#auth-toggle').onclick=()=>{authMode=authMode==='login'?'register':'login';authScreen();};
  document.querySelector('#auth').onsubmit=async e=>{
    e.preventDefault(); if(busy)return;
    const f=new FormData(e.target), username=f.get('username').trim().toLowerCase(), password=f.get('password');
    const error=document.querySelector('#auth-error'), button=e.target.querySelector('button');
    if(!crypto.subtle){error.textContent='Für Verschlüsselung ist HTTPS erforderlich (oder localhost).';return;}
    if(authMode==='register' && password!==f.get('confirm')){error.textContent='Die Passwörter stimmen nicht überein.';return;}
    busy=true;button.disabled=true;button.textContent='Wird sicher entsperrt …';
    try {
      const auth=await authSecret(username,password);
      let result;
      if(authMode==='register') {
        const keySalt=randomSalt(); key=await vaultKey(password,keySalt);
        const initial={version:1,conditions:[],pain:[],meds:[],intakes:[],cycles:[]};
        result=await api('register',{username,auth,keySalt,vault:await encrypt(key,initial)});
      } else { result=await api('login',{username,auth});key=await vaultKey(password,result.keySalt); }
      data=await decrypt(key,result.vault); revision=result.revision;lastActivity=Date.now();e.target.reset();page='today';render();
    } catch(err) {key=null;data=null;error.textContent=err.message;button.disabled=false;button.textContent='Erneut versuchen';}
    finally{busy=false;}
  };
}
const names={today:'Übersicht',pain:'Schmerzen',meds:'Medikamente',cycle:'Zyklus',settings:'Datenschutz'};
function render() {
  if(!data)return;
  root.innerHTML=`<div class="layout"><aside><a class="brand" href="#"><img class="logo" src="/icon-192.png" alt="" width="42" height="42"><span>Flesh<small>RAUM FÜR DEINE GESUNDHEIT</small></span></a><nav>${Object.entries(names).map(([id,name],i)=>`<button data-page="${id}" class="${page===id?'active':''}"><span>${['◫','◌','✚','◒','◇'][i]}</span>${name}</button>`).join('')}</nav><div class="sidebar-bottom"><p>◇ Ende-zu-Ende verschlüsselt</p><button data-action="lock">Journal sperren ↗</button></div></aside><main class="main"><header><span>${new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'})}</span><button class="lock-mobile" data-action="lock">Sperren ◇</button><span class="secure">◇ Privat & verschlüsselt</span></header><div id="content">${content()}</div><footer>Dein Tempo. Dein Körper. Dein Journal.</footer></main></div>`;
  root.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render();});
  root.querySelectorAll('[data-action="lock"]').forEach(b=>b.onclick=lock);
  bindForms();
  root.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Diesen Eintrag endgültig löschen?'))return;await mutate(d=>{d[b.dataset.collection]=d[b.dataset.collection].filter(x=>x.id!==b.dataset.delete);});});
  root.querySelectorAll('[data-intake]').forEach(b=>b.onclick=()=>mutate(d=>d.intakes.push({id:crypto.randomUUID(),medId:b.dataset.intake,date:localDate(),time:b.dataset.time,takenAt:new Date().toISOString(),medName:d.meds.find(m=>m.id===b.dataset.intake)?.name,dose:d.meds.find(m=>m.id===b.dataset.intake)?.dose})));
  document.querySelector('#notifications')?.addEventListener('click',async()=>{if(!('Notification'in window)){toast('Dieser Browser unterstützt hier keine Benachrichtigungen.');return;}try{toast((await Notification.requestPermission())==='granted'?'Erinnerungen sind bei geöffneter, entsperrter App aktiviert.':'Benachrichtigungen wurden nicht erlaubt.');}catch{toast('Benachrichtigungen sind auf diesem Gerät nicht verfügbar.');}});
  document.querySelector('#export')?.addEventListener('click',async()=>{try{const v=await api('vault');const blob=new Blob([JSON.stringify({format:'health-app-encrypted-v1',keySalt:v.keySalt,vault:v.vault},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='journal-verschluesselt-'+localDate()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){toast(e.message);}});
}
function title(kicker,title,sub){return `<p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="intro">${sub}</p>`;}
function remove(collection,id){return `<button class="delete" data-collection="${collection}" data-delete="${esc(id)}" aria-label="Eintrag löschen">Löschen</button>`;}
function conditionName(id){return esc(data.conditions.find(c=>c.id===id)?.name||'Unbekanntes Leiden');}
function painList(entries){return entries.length?entries.map(p=>`<article class="entry"><div><strong>${conditionName(p.conditionId)}</strong><p>${fmt(p.date)} · ${esc(p.location||'Keine Körperstelle angegeben')}</p>${p.note?`<p class="note">${esc(p.note)}</p>`:''}</div><span class="score">${esc(p.level)}<small>/10</small></span>${remove('pain',p.id)}</article>`).join(''):empty('Noch keine Schmerzen protokolliert. Halte hier fest, was dich beschäftigt.');}
function doses() {return data.meds.flatMap(m=>m.times.split(',').map(t=>({med:m,time:t.trim()}))).filter(x=>(!x.med.start||x.med.start<=localDate())&&(!x.med.end||x.med.end>=localDate())).sort((a,b)=>a.time.localeCompare(b.time));}
function doseList(){const items=doses();return items.length?items.map(({med:m,time})=>{const taken=data.intakes.some(i=>i.medId===m.id&&i.date===localDate()&&i.time===time);return `<article class="entry"><span class="time">${esc(time)}</span><div><strong>${esc(m.name)}</strong><p>${esc(m.dose)}</p></div><button ${taken?'disabled class="taken"':'class="secondary"'} data-intake="${esc(m.id)}" data-time="${esc(time)}">${taken?'✓ Eingenommen':'Einnahme bestätigen'}</button></article>`;}).join(''):empty('Für heute sind keine Medikamente eingeplant.');}
function cycleSummary(){
 const starts=data.cycles.filter(c=>c.periodStart).map(c=>c.date).sort();
 if(!starts.length)return '<p class="hint">Markiere den ersten Tag einer Periode, um deine Zykluslängen zu verfolgen.</p>';
 const last=starts.at(-1);
 const days=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
 const current=days(localDate(),last)+1;
 const lengths=starts.slice(1).map((s,i)=>days(s,starts[i]));
 return `<p class="hint">Letzter Periodenbeginn: ${fmt(last)}${current>0?' · Zyklustag '+current:''}${lengths.length?' · Bisherige Zykluslängen: '+lengths.join(', ')+' Tage':''}. Keine Vorhersage.</p>`;
}
function content(){
 if(page==='today')return `${title('DEIN TAG IM BLICK','Wie geht es dir heute?','Ein kleiner Moment für dich. Alles Wichtige an einem Ort.')}<div class="stats"><div class="stat"><span>Schmerzprotokoll</span><strong>${data.pain.filter(p=>p.date===localDate()).length}<small> Einträge heute</small></strong><button data-page="pain">Beschwerden festhalten ↗</button></div><div class="stat peach"><span>Medikamente</span><strong>${data.intakes.filter(i=>i.date===localDate()).length}<small> von ${doses().length} heute</small></strong><button data-page="meds">Medikamentenplan öffnen ↗</button></div><div class="stat lilac"><span>Zyklustagebuch</span><strong>${data.cycles.length}<small> Einträge</small></strong><button data-page="cycle">Deinen Rhythmus ansehen ↗</button></div></div><div class="two-col"><section class="card"><div class="section-head"><h2>Dein Medikamentenplan</h2><span class="tag">HEUTE</span></div>${doseList()}</section><section class="card soft"><p class="eyebrow">GUT ZU WISSEN</p><h2>Raum für kleine<br>Beobachtungen.</h2><p>Auch ein guter Tag ist einen Eintrag wert. Regelmäßige Notizen helfen dir, Veränderungen im Verlauf zu erkennen.</p><button class="secondary" data-page="pain">Schmerzen eintragen +</button></section></div><section class="card"><h2>Letzte Schmerzeinträge</h2>${painList([...data.pain].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4))}</section>`;
 if(page==='pain')return `${title('BEOBACHTEN & VERSTEHEN','Deine Beschwerden.','Jeder Schmerzeintrag gehört zu einem von dir angelegten Leiden.')}<div class="two-col"><section class="card"><h2>Schmerz protokollieren</h2>${data.conditions.length?`<form id="pain-form"><label>Leiden<select name="conditionId">${data.conditions.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>${labelDate()}<label>Schmerzstärke (0 = keine, 10 = stärkste)<div class="range"><input name="level" type="range" min="0" max="10" value="5"><output>5 / 10</output></div></label><label>Körperstelle<input name="location" maxlength="150" placeholder="z. B. rechte Schläfe"></label>${note()}<button class="primary">Eintrag speichern</button></form>`:empty('Lege zuerst ein Leiden an, um Schmerzen zuzuordnen.')}</section><section class="card soft"><h2>Deine Leiden</h2><p>Zum Beispiel Migräne, Endometriose oder Rückenschmerzen.</p><div class="chips">${data.conditions.map(c=>`<span class="chip">${esc(c.name)}</span>`).join('')}</div><form id="condition-form"><label>Neues Leiden<input name="name" maxlength="100" required placeholder="Bezeichnung"></label><button class="secondary">Leiden hinzufügen +</button></form></section></div><section class="card"><h2>Schmerzverlauf</h2>${painList([...data.pain].sort((a,b)=>b.date.localeCompare(a.date)))}</section>`;
 if(page==='meds')return `${title('DEINE ROUTINE','Gut versorgt durch den Tag.','Plane Medikamente und halte deine Einnahmen fest.')}<section class="card"><h2>Heute vorgesehen</h2>${doseList()}<button class="link" id="notifications">Benachrichtigungen erlauben</button><p class="hint">Erinnerungen nur bei geöffneter, entsperrter App. Für wichtige Einnahmen zusätzlich einen Systemwecker verwenden.</p></section><div class="two-col"><section class="card"><h2>Medikament hinzufügen</h2><form id="med-form"><label>Name<input name="name" required maxlength="150" placeholder="Medikament"></label><label>Dosierung<input name="dose" required maxlength="150" placeholder="z. B. 1 Tablette · 20 mg"></label><label>Täglich um (mehrere Zeiten mit Komma)<input name="times" required placeholder="08:00, 20:00" value="08:00"></label><div class="fields"><label>Ab<input type="date" name="start" required value="${localDate()}"></label><label>Bis (optional)<input type="date" name="end"></label></div>${note()}<button class="primary">Plan speichern</button></form></section><section class="card"><h2>Deine Medikamentenpläne</h2>${data.meds.length?data.meds.map(m=>`<article class="entry"><div><strong>${esc(m.name)}</strong><p>${esc(m.dose)} · ${esc(m.times)}</p><p>Ab ${fmt(m.start)}${m.end?' bis '+fmt(m.end):''}</p><p class="note">${esc(m.note)}</p></div>${remove('meds',m.id)}</article>`).join(''):empty('Noch keine Medikamente angelegt.')}</section></div><section class="card"><h2>Einnahmeprotokoll</h2>${data.intakes.length?[...data.intakes].reverse().map(i=>`<article class="entry"><div><strong>${esc(i.medName||data.meds.find(m=>m.id===i.medId)?.name||'Entferntes Medikament')}</strong><p>${fmt(i.date)} · geplant ${esc(i.time)} · bestätigt ${new Date(i.takenAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</p></div>${remove('intakes',i.id)}</article>`).join(''):empty('Bestätigte Einnahmen erscheinen hier.')}</section>`;
 if(page==='cycle')return `${title('DEIN EIGENER RHYTHMUS','Platz für deinen Zyklus.','Blutung, Beschwerden und Beobachtungen im Verlauf.')}<div class="two-col"><section class="card"><h2>Zykluseintrag</h2><form id="cycle-form">${labelDate()}<label class="check-row"><input type="checkbox" name="periodStart">Erster Tag einer neuen Periode</label><label for="cycle-flow">Blutung</label><select id="cycle-flow" name="flow"><option>Keine</option><option>Schmierblutung</option><option>Leicht</option><option>Mittel</option><option>Stark</option></select><fieldset><legend>Beschwerden</legend><div class="checks">${['Krämpfe','Kopfschmerzen','Rückenschmerzen','Übelkeit','Müdigkeit','Brustspannen','Stimmungsschwankungen'].map(s=>`<label><input type="checkbox" name="symptoms" value="${s}">${s}</label>`).join('')}</div></fieldset><label>Beschwerdestärke (0–10)<input type="number" name="level" value="0" min="0" max="10" required></label>${note()}<button class="primary">Zykluseintrag speichern</button></form></section><section class="card soft"><p class="eyebrow">DEIN VERLAUF</p><h2>Jeder Zyklus<br>ist individuell.</h2><p>Notiere auch Tage ohne Blutung. So entsteht nach und nach ein persönlicher Überblick über deinen Zyklus und deine Beschwerden.</p><p class="hint">Dieses Journal berechnet keine fruchtbaren Tage und eignet sich nicht zur Verhütung.</p></section></div><section class="card"><h2>Zyklustagebuch</h2>${cycleSummary()}${data.cycles.length?[...data.cycles].sort((a,b)=>b.date.localeCompare(a.date)).map(c=>`<article class="entry"><div><strong>${fmt(c.date)} · ${esc(c.flow)}${c.periodStart?' · Periodenbeginn':''}</strong><p>${c.symptoms.map(esc).join(' · ')||'Keine Beschwerden markiert'} · Stärke ${esc(c.level)}/10</p><p class="note">${esc(c.note)}</p></div>${remove('cycles',c.id)}</article>`).join(''):empty('Dein erster Eintrag ist der Anfang deines Verlaufs.')}</section>`;
 return `${title('DEINE DATEN GEHÖREN DIR','Privat bleibt privat.','Gesundheitsdaten werden ausschließlich im entsperrten Browser lesbar.')}<section class="card prose"><h2>So wird dein Journal geschützt</h2><p>Dein Browser verschlüsselt alle Gesundheitsdaten mit AES-256-GCM. Der Schlüssel wird aus deinem Passwort abgeleitet und niemals an den Server übertragen. Dort liegen nur der verschlüsselte Tresor und technische Kontodaten.</p><p>Nach fünf Minuten ohne Interaktion oder einer Minute im Hintergrund wird das Journal gesperrt. Schlüssel und entschlüsselte Daten werden dabei aus dem App-Zustand entfernt. Offline werden keine Änderungen gespeichert.</p><p>Der Zugriff ist auf deine angemeldeten Browser beschränkt; ein weiteres Gerät kann mit demselben Account und Passwort entschlüsseln. Eine technische Bindung an ein bestimmtes Handy ist in dieser Version nicht enthalten.</p><h2>Verschlüsseltes Backup</h2><p>Lade eine Kopie des zuletzt auf dem Server gespeicherten Tresors herunter. Sie enthält keine lesbaren Gesundheitsdaten. Ein Wiederherstellungsdialog folgt; das Backup kann mit deinem Passwort und dem enthaltenen Schlüsselsalz entschlüsselt werden.</p><button class="secondary" id="export">Verschlüsseltes Backup herunterladen ↓</button><h2>Wichtig für dein Passwort</h2><p>Es gibt noch keinen Passwortwechsel oder Wiederherstellungsschlüssel. Ein verlorenes Passwort bedeutet verlorenen Zugang zu den Gesundheitsdaten. Nutze einen Passwortmanager.</p></section>`;
}
async function mutate(change) {
 if(busy||!data)return;
 busy=true;
 const next=structuredClone(data), currentGeneration=generation, currentKey=key, currentRevision=revision;
 try{change(next);const encrypted=await encrypt(currentKey,next);if(currentGeneration!==generation)return;const result=await api('vault',{vault:encrypted,revision:currentRevision});if(!data||currentGeneration!==generation)return;data=next;revision=result.revision;render();toast('Verschlüsselt auf dem Server gespeichert.');}
 catch(e){toast(e.message);}
 finally{busy=false;}
}
function bindForms(){
 const range=root.querySelector('input[type="range"]');if(range)range.oninput=()=>range.nextElementSibling.value=range.value+' / 10';
 for(const type of ['condition','pain','med','cycle']){
  const form=document.querySelector('#'+type+'-form');if(!form)continue;
  form.onsubmit=async e=>{
   e.preventDefault();if(busy)return;
   const f=new FormData(form), entry=Object.fromEntries(f), id=crypto.randomUUID();
   if(type==='condition'&&!entry.name.trim()){toast('Bitte eine Bezeichnung eingeben.');return;}
   if(type==='med'){
    const times=entry.times.split(',').map(t=>t.trim());
    if(!times.length||times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||new Set(times).size!==times.length){toast('Bitte eindeutige Uhrzeiten im Format HH:MM eingeben.');return;}
    entry.times=times.sort().join(', ');
    if(entry.end&&entry.end<entry.start){toast('Das Enddatum muss nach dem Startdatum liegen.');return;}
   }
   await mutate(d=>{
    if(type==='condition')d.conditions.push({id,name:entry.name.trim()});
    if(type==='pain')d.pain.push({...entry,id,level:Number(entry.level)});
    if(type==='med')d.meds.push({...entry,id});
    if(type==='cycle'){
     if(d.cycles.some(c=>c.date===entry.date))throw new Error('Für diesen Tag gibt es bereits einen Zykluseintrag. Lösche ihn vor einer Korrektur.');
     d.cycles.push({...entry,id,level:Number(entry.level),symptoms:f.getAll('symptoms'),periodStart:f.has('periodStart')});
    }
   });
  };
 }
}
function lock(){authMode='login';generation++;key=null;data=null;revision=null;busy=false;root.replaceChildren();authScreen();api('logout',{}).catch(()=>{});}
for(const event of ['pointerdown','keydown','touchstart'])document.addEventListener(event,()=>{if(data&&Date.now()-lastActivity>=300000)lock();lastActivity=Date.now();},{passive:true});
let hiddenAt=null;
document.addEventListener('visibilitychange',()=>{if(document.hidden)hiddenAt=Date.now();else if(data&&hiddenAt&&Date.now()-hiddenAt>=60000)lock();});
const notified=new Set();
setInterval(()=>{
 if(!data)return;
 if(Date.now()-lastActivity>300000 || (document.hidden&&hiddenAt&&Date.now()-hiddenAt>=60000)){lock();return;}
 const now=new Date(), time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
 for(const {med,time:t} of doses()){
  const id=`${localDate()}:${med.id}:${t}`;
  if(t!==time||notified.has(id)||data.intakes.some(i=>i.medId===med.id&&i.date===localDate()&&i.time===t))continue;
  notified.add(id);toast('Eine geplante Medikamenteneinnahme ist jetzt fällig.');
  // Notification text deliberately excludes drug names and other health data.
  if('Notification'in window&&Notification.permission==='granted')navigator.serviceWorker?.ready.then(reg=>reg.showNotification('Flesh',{body:'Eine persönliche Erinnerung ist fällig.',tag:id,icon:'/icon-192.png'})).catch(()=>{});
 }
},15000);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
authScreen();
